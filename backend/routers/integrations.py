"""ERP / API key / Webhooks for external systems"""
from fastapi import APIRouter, Depends, HTTPException, Header

from server import db
from models import ApiKeyIn, WebhookIn, ErpSendMessageIn, uid, now
from helpers import (
    get_current_user, generate_api_key, hash_api_key, audit_log,
    get_tenant_from_api_key, decrypt_text, send_whatsapp, update_usage, mask,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])


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
        "created_by": current["id"],
        "created_at": now().isoformat(),
    }
    await db.api_keys.insert_one(doc)
    await audit_log(current["tenant_id"], current["id"], "create_api_key", doc["id"], {"name": payload.name})
    # raw key shown ONCE
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
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "name": payload.name,
        "url": payload.url,
        "events": payload.events,
        "secret": payload.secret,
        "is_active": True,
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


# ============ ERP-facing endpoints (require X-API-Key) ============
@router.post("/erp/send-message")
async def erp_send_message(payload: ErpSendMessageIn, ctx=Depends(get_tenant_from_api_key)):
    tenant = ctx["tenant"]
    cred = None
    if payload.credential_id:
        cred = await db.whatsapp_credentials.find_one(
            {"id": payload.credential_id, "tenant_id": tenant["id"]}, {"_id": 0}
        )
    if not cred:
        cred = await db.whatsapp_credentials.find_one({"tenant_id": tenant["id"]}, {"_id": 0})
    if not cred:
        raise HTTPException(400, "No WhatsApp credential configured")

    res = send_whatsapp(cred, payload.to_phone, payload.message)
    await update_usage(tenant["id"], "messages_sent", 1)
    await update_usage(tenant["id"], "api_calls", 1)
    return res


@router.post("/erp/leads")
async def erp_create_lead(payload: dict, ctx=Depends(get_tenant_from_api_key)):
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
    return doc


# ============ Audit logs ============
@router.get("/audit-logs")
async def list_audit(current=Depends(get_current_user)):
    cur = db.audit_logs.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1).limit(200)
    return await cur.to_list(200)
