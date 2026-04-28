"""ERP / API key / Webhooks for external systems.

Production-grade ERP passthrough — wallet-billed sends, signed outbound webhooks,
template substitution, batch send, conversation lookup, and balance check.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server import db
from models import ApiKeyIn, WebhookIn, ErpSendMessageIn, uid, now
from helpers import (
    get_current_user, generate_api_key, hash_api_key, audit_log,
    get_tenant_from_api_key, decrypt_text, send_whatsapp_billed, update_usage,
    run_sync,
)
from erp_dispatcher import dispatch_event, deliver_test
from ws_manager import ws_manager

router = APIRouter(prefix="/integrations", tags=["integrations"])


VALID_EVENTS = {
    "message.sent", "message.received", "message.status",
    "message.failed", "lead.created", "test.ping",
}


# ============ API Keys ============
@router.post("/api-keys")
async def create_api_key(payload: ApiKeyIn, current=Depends(get_current_user)):
    raw, h = generate_api_key()
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "name": payload.name,
        "key_hash": h,
        "key_prefix": raw[:8],
        "scopes": payload.scopes,
        "is_active": True,
        "call_count": 0,
        "rate_limit_per_min": 120,
        "created_by": current["id"],
        "created_at": now().isoformat(),
    }
    await db.api_keys.insert_one(doc)
    await audit_log(current["tenant_id"], current["id"], "create_api_key", doc["id"], {"name": payload.name})
    doc.pop("_id", None)
    return {**{k: v for k, v in doc.items() if k != "key_hash"}, "api_key": raw}


@router.get("/api-keys")
async def list_api_keys(current=Depends(get_current_user)):
    cur = db.api_keys.find({"tenant_id": current["tenant_id"]}, {"_id": 0, "key_hash": 0}).sort("created_at", -1)
    return await cur.to_list(100)


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: str, current=Depends(get_current_user)):
    res = await db.api_keys.update_one(
        {"id": key_id, "tenant_id": current["tenant_id"]},
        {"$set": {"is_active": False}},
    )
    return {"revoked": bool(res.modified_count)}


# ============ Webhooks (outbound — to user's ERP) ============
@router.post("/webhooks")
async def add_webhook(payload: WebhookIn, current=Depends(get_current_user)):
    invalid = [e for e in payload.events if e not in VALID_EVENTS]
    if invalid:
        raise HTTPException(400, f"Invalid events: {invalid}. Allowed: {sorted(VALID_EVENTS)}")
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "name": payload.name,
        "url": payload.url,
        "events": payload.events,
        "secret": payload.secret,
        "is_active": True,
        "delivery_count": 0,
        "success_count": 0,
        "failure_count": 0,
        "last_delivery_at": None,
        "last_status": None,
        "created_at": now().isoformat(),
    }
    await db.erp_webhooks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/webhooks")
async def list_webhooks(current=Depends(get_current_user)):
    cur = db.erp_webhooks.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(100)


@router.delete("/webhooks/{wid}")
async def delete_webhook(wid: str, current=Depends(get_current_user)):
    res = await db.erp_webhooks.delete_one({"id": wid, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


@router.post("/webhooks/{wid}/test")
async def test_webhook(wid: str, current=Depends(get_current_user)):
    """Send a synchronous test ping to a webhook URL. Returns the delivery result."""
    hook = await db.erp_webhooks.find_one({"id": wid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not hook:
        raise HTTPException(404, "Webhook not found")
    return await deliver_test(db, hook, "test.ping",
                              {"company": current.get("tenant_id"), "by": current.get("email")})
@router.get("/webhooks/{wid}/deliveries")
async def list_deliveries(wid: str, current=Depends(get_current_user), limit: int = 50):
    hook = await db.erp_webhooks.find_one({"id": wid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not hook:
        raise HTTPException(404, "Webhook not found")
    cur = db.webhook_deliveries.find(
        {"webhook_id": wid, "tenant_id": current["tenant_id"]}, {"_id": 0},
    ).sort("attempted_at", -1).limit(min(200, max(1, limit)))
    return await cur.to_list(200)


# ============ Rate-limit helper ============
async def _rate_check(api_key: dict) -> None:
    """Simple sliding-window per-minute counter."""
    limit = int(api_key.get("rate_limit_per_min") or 120)
    bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    res = await db.api_key_usage.find_one_and_update(
        {"key_hash": api_key["key_hash"], "bucket": bucket},
        {"$inc": {"count": 1},
         "$setOnInsert": {"key_hash": api_key["key_hash"], "bucket": bucket,
                          "tenant_id": api_key["tenant_id"]}},
        upsert=True,
        return_document=True,
    )
    if (res or {}).get("count", 0) > limit:
        raise HTTPException(429, f"Rate limit exceeded ({limit}/min)")


# ============ ERP-facing endpoints (require X-API-Key) ============
@router.get("/erp/balance")
async def erp_balance(ctx=Depends(get_tenant_from_api_key)):
    """Return wallet balance + billing mode for the calling tenant."""
    tenant = ctx["tenant"]
    return {
        "tenant_id": tenant["id"],
        "company_name": tenant.get("company_name", ""),
        "billing_mode": tenant.get("billing_mode") or "byoc",
        "wallet_balance_inr": float(tenant.get("wallet_balance_inr") or 0.0),
    }


async def _save_outbound_msg(tenant_id: str, cred: dict, to_phone: str, content: str,
                             result: dict, media_url: str | None = None,
                             media_type: str | None = None) -> dict:
    """Persist an outbound ERP-originated send into messages + conversation, dispatch webhook."""
    conv = await db.conversations.find_one(
        {"tenant_id": tenant_id, "customer_phone": to_phone}, {"_id": 0},
    )
    if not conv:
        conv = {
            "id": uid(),
            "tenant_id": tenant_id,
            "credential_id": cred["id"],
            "customer_phone": to_phone,
            "customer_name": to_phone,
            "status": "active",
            "unread_count": 0,
            "lead_score": 50,
            "last_message": content,
            "last_message_at": now().isoformat(),
            "created_at": now().isoformat(),
        }
        await db.conversations.insert_one(conv)
    else:
        await db.conversations.update_one(
            {"id": conv["id"]},
            {"$set": {"last_message": content, "last_message_at": now().isoformat()}},
        )

    msg_id = uid()
    msg_doc = {
        "id": msg_id,
        "conversation_id": conv["id"],
        "tenant_id": tenant_id,
        "direction": "outbound",
        "content": content,
        "media_url": media_url,
        "media_type": media_type,
        "status": result.get("status", "sent") if result.get("success") else "failed",
        "message_id": result.get("sid", ""),
        "source": "erp",
        "sent_at": now().isoformat(),
        "error": None if result.get("success") else result.get("error"),
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    try:
        await ws_manager.broadcast(tenant_id, {"type": "message", "conversation_id": conv["id"], "message": msg_doc})
    except Exception:
        pass

    event = "message.sent" if result.get("success") else "message.failed"
    await dispatch_event(db, tenant_id, event, {
        "id": msg_id,
        "conversation_id": conv["id"],
        "to_phone": to_phone,
        "content": content,
        "status": msg_doc["status"],
        "media_url": media_url,
        "media_type": media_type,
        "provider_id": result.get("sid", ""),
        "error": result.get("error"),
    })
    return {"id": msg_id, "conversation_id": conv["id"], "status": msg_doc["status"]}


class ErpSendIn(BaseModel):
    credential_id: str | None = None
    to_phone: str = Field(min_length=8)
    message: str = Field(min_length=1, max_length=4096)
    media_url: str | None = None
    media_type: str | None = None  # image | document | audio | video
    category: str = "marketing"  # marketing | utility | authentication | service


async def _resolve_credential(tenant_id: str, credential_id: str | None) -> dict:
    cred = None
    if credential_id:
        cred = await db.whatsapp_credentials.find_one(
            {"id": credential_id, "tenant_id": tenant_id}, {"_id": 0}
        )
    if not cred:
        cred = await db.whatsapp_credentials.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not cred:
        raise HTTPException(400, "No WhatsApp credential configured for tenant")
    return cred


@router.post("/erp/send-message")
async def erp_send_message(payload: ErpSendIn, ctx=Depends(get_tenant_from_api_key)):
    """Wallet-billed single send. Persists, broadcasts and signs an outbound webhook."""
    await _rate_check(ctx["api_key"])
    tenant = ctx["tenant"]
    if not payload.to_phone.startswith("+"):
        raise HTTPException(400, "to_phone must be E.164 (e.g. +919876543210)")
    cred = await _resolve_credential(tenant["id"], payload.credential_id)

    result = await send_whatsapp_billed(
        db, tenant["id"], cred, payload.to_phone, payload.message,
        media_url=payload.media_url, media_type=payload.media_type,
        category=payload.category, note="ERP API send",
    )
    saved = await _save_outbound_msg(
        tenant["id"], cred, payload.to_phone, payload.message, result,
        payload.media_url, payload.media_type,
    )
    await update_usage(tenant["id"], "messages_sent", 1)
    await update_usage(tenant["id"], "api_calls", 1)
    return {**saved, "billing": result.get("billing", {}), "success": result.get("success", False),
            "error": result.get("error")}


class ErpBulkRecipient(BaseModel):
    to_phone: str
    variables: dict[str, str] = {}  # template variable substitutions


class ErpBulkIn(BaseModel):
    credential_id: str | None = None
    message: str = Field(min_length=1, max_length=4096)  # supports {{variable}} placeholders
    recipients: list[ErpBulkRecipient] = Field(min_length=1, max_length=100)
    media_url: str | None = None
    media_type: str | None = None
    category: str = "marketing"


def _substitute(template: str, vars_: dict) -> str:
    out = template
    for k, v in (vars_ or {}).items():
        out = out.replace("{{" + str(k) + "}}", str(v))
    return out


@router.post("/erp/send-bulk")
async def erp_send_bulk(payload: ErpBulkIn, ctx=Depends(get_tenant_from_api_key)):
    """Send a templated message to up to 100 recipients with per-recipient variable substitution."""
    await _rate_check(ctx["api_key"])
    tenant = ctx["tenant"]
    cred = await _resolve_credential(tenant["id"], payload.credential_id)

    sent = 0
    failed = 0
    insufficient = 0
    items: list[dict] = []
    for r in payload.recipients:
        if not r.to_phone.startswith("+"):
            failed += 1
            items.append({"to_phone": r.to_phone, "status": "failed", "error": "invalid_phone"})
            continue
        body = _substitute(payload.message, r.variables)
        result = await send_whatsapp_billed(
            db, tenant["id"], cred, r.to_phone, body,
            media_url=payload.media_url, media_type=payload.media_type,
            category=payload.category, note="ERP bulk send",
        )
        saved = await _save_outbound_msg(
            tenant["id"], cred, r.to_phone, body, result,
            payload.media_url, payload.media_type,
        )
        if result.get("success"):
            sent += 1
        else:
            failed += 1
            if (result.get("billing") or {}).get("reason") == "insufficient_balance":
                insufficient += 1
        items.append({
            "to_phone": r.to_phone, "id": saved["id"],
            "status": saved["status"], "error": result.get("error"),
        })

    await update_usage(tenant["id"], "messages_sent", sent)
    await update_usage(tenant["id"], "api_calls", 1)
    return {"sent": sent, "failed": failed, "insufficient_balance": insufficient,
            "results": items}


class ErpTemplateIn(BaseModel):
    credential_id: str | None = None
    template_id: str
    to_phone: str
    variables: dict[str, str] = {}
    category: str = "marketing"


@router.post("/erp/send-template")
async def erp_send_template(payload: ErpTemplateIn, ctx=Depends(get_tenant_from_api_key)):
    """Send a saved template with variable substitution."""
    await _rate_check(ctx["api_key"])
    tenant = ctx["tenant"]
    tpl = await db.templates.find_one({"id": payload.template_id, "tenant_id": tenant["id"]}, {"_id": 0})
    if not tpl:
        raise HTTPException(400, "Template not found")
    cred = await _resolve_credential(tenant["id"], payload.credential_id)
    body = _substitute(tpl.get("body") or "", payload.variables)
    if not payload.to_phone.startswith("+"):
        raise HTTPException(400, "to_phone must be E.164")
    result = await send_whatsapp_billed(
        db, tenant["id"], cred, payload.to_phone, body,
        media_url=tpl.get("media_url"), media_type=tpl.get("media_type"),
        category=payload.category, note=f"ERP template send: {tpl.get('name', '')}",
    )
    saved = await _save_outbound_msg(
        tenant["id"], cred, payload.to_phone, body, result,
        tpl.get("media_url"), tpl.get("media_type"),
    )
    await update_usage(tenant["id"], "messages_sent", 1)
    await update_usage(tenant["id"], "api_calls", 1)
    return {**saved, "billing": result.get("billing", {}), "success": result.get("success", False),
            "error": result.get("error")}


@router.get("/erp/messages")
async def erp_messages(phone: str | None = None, conversation_id: str | None = None,
                      limit: int = 50, ctx=Depends(get_tenant_from_api_key)):
    """Fetch the most recent messages for a phone or conversation."""
    await _rate_check(ctx["api_key"])
    tenant = ctx["tenant"]
    q: dict = {"tenant_id": tenant["id"]}
    if conversation_id:
        q["conversation_id"] = conversation_id
    elif phone:
        if not phone.startswith("+"):
            raise HTTPException(400, "phone must be E.164")
        conv = await db.conversations.find_one(
            {"tenant_id": tenant["id"], "customer_phone": phone}, {"_id": 0},
        )
        if not conv:
            return {"conversation": None, "messages": []}
        q["conversation_id"] = conv["id"]
    else:
        raise HTTPException(400, "Provide phone or conversation_id")
    cur = db.messages.find(q, {"_id": 0}).sort("sent_at", -1).limit(min(200, max(1, limit)))
    msgs = await cur.to_list(200)
    return {"messages": list(reversed(msgs))}


@router.post("/erp/leads")
async def erp_create_lead(payload: dict, ctx=Depends(get_tenant_from_api_key)):
    await _rate_check(ctx["api_key"])
    tenant = ctx["tenant"]
    phone = payload.get("phone")
    if not phone:
        raise HTTPException(400, "phone required")
    existing = await db.leads.find_one({"tenant_id": tenant["id"], "phone": phone}, {"_id": 0})
    if existing:
        return {"id": existing["id"], "duplicate": True}
    doc = {
        "id": uid(),
        "tenant_id": tenant["id"],
        "phone": phone,
        "name": payload.get("name") or phone,
        "email": payload.get("email"),
        "company": payload.get("company"),
        "source": payload.get("source", "erp"),
        "status": "new",
        "lead_score": 50,
        "custom_fields": payload.get("custom_fields") or {},
        "created_at": now().isoformat(),
    }
    await db.leads.insert_one(doc)
    await update_usage(tenant["id"], "api_calls", 1)
    doc.pop("_id", None)
    await dispatch_event(db, tenant["id"], "lead.created", {
        "id": doc["id"], "phone": phone, "name": doc["name"],
        "source": doc["source"], "company": doc.get("company"),
    })
    return doc


# ============ Audit logs ============
@router.get("/audit-logs")
async def list_audit(current=Depends(get_current_user)):
    cur = db.audit_logs.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1).limit(200)
    return await cur.to_list(200)
