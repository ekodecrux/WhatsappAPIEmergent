"""WhatsApp credentials, message send, templates, webhooks"""
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse

from server import db
from models import CredentialIn, CredentialOut, TemplateIn, SendMessageIn, uid, now
from helpers import (
    get_current_user, encrypt_text, decrypt_text, mask, audit_log,
    send_whatsapp_via_twilio, validate_twilio_credentials, update_usage,
    ai_suggest_reply, ai_analyze_sentiment, run_sync,
)
from ws_manager import ws_manager

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ============ Credentials ============
@router.post("/credentials", response_model=CredentialOut)
async def add_credential(payload: CredentialIn, current=Depends(get_current_user)):
    if payload.provider not in ("twilio", "twilio_sandbox", "meta_cloud"):
        raise HTTPException(400, "Unsupported provider")

    is_valid = True
    if payload.provider == "twilio_sandbox":
        # Use platform's Twilio sandbox; no user creds required
        sid = os.environ["TWILIO_ACCOUNT_SID"]
        tok = os.environ["TWILIO_AUTH_TOKEN"]
        wfrom = os.environ["TWILIO_WHATSAPP_FROM"]
    elif payload.provider == "twilio":
        if not (payload.account_sid and payload.auth_token and payload.whatsapp_from):
            raise HTTPException(400, "Twilio requires account_sid, auth_token and whatsapp_from")
        is_valid = validate_twilio_credentials(payload.account_sid, payload.auth_token)
        if not is_valid:
            raise HTTPException(400, "Twilio credentials validation failed")
        sid, tok, wfrom = payload.account_sid, payload.auth_token, payload.whatsapp_from
    else:  # meta_cloud
        if not (payload.access_token and payload.phone_number_id):
            raise HTTPException(400, "Meta Cloud requires access_token and phone_number_id")
        sid, tok, wfrom = "", payload.access_token, ""

    cred_id = uid()
    doc = {
        "id": cred_id,
        "tenant_id": current["tenant_id"],
        "name": payload.name,
        "provider": payload.provider,
        "account_sid_enc": encrypt_text(sid),
        "auth_token_enc": encrypt_text(tok),
        "whatsapp_from": wfrom,
        "access_token_enc": encrypt_text(payload.access_token or ""),
        "phone_number_id": payload.phone_number_id or "",
        "business_account_id": payload.business_account_id or "",
        "is_verified": is_valid,
        "status": "active" if is_valid else "pending",
        "created_at": now().isoformat(),
    }
    await db.whatsapp_credentials.insert_one(doc)
    await audit_log(current["tenant_id"], current["id"], "add_credential", cred_id, {"name": payload.name})

    return CredentialOut(
        id=cred_id, name=payload.name, provider=payload.provider,
        whatsapp_from=wfrom, phone_number_id=payload.phone_number_id,
        is_verified=is_valid, status=doc["status"],
        created_at=datetime.fromisoformat(doc["created_at"]),
    )


@router.get("/credentials")
async def list_credentials(current=Depends(get_current_user)):
    cur = db.whatsapp_credentials.find({"tenant_id": current["tenant_id"]}, {"_id": 0})
    items = await cur.to_list(100)
    out = []
    for c in items:
        out.append({
            "id": c["id"],
            "name": c["name"],
            "provider": c["provider"],
            "whatsapp_from": c.get("whatsapp_from", ""),
            "phone_number_id": c.get("phone_number_id", ""),
            "account_sid_masked": mask(decrypt_text(c.get("account_sid_enc", "")), 4),
            "is_verified": c.get("is_verified", False),
            "status": c.get("status", "pending"),
            "created_at": c.get("created_at"),
        })
    return out


@router.delete("/credentials/{cred_id}")
async def delete_credential(cred_id: str, current=Depends(get_current_user)):
    res = await db.whatsapp_credentials.delete_one({"id": cred_id, "tenant_id": current["tenant_id"]})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    await audit_log(current["tenant_id"], current["id"], "delete_credential", cred_id)
    return {"deleted": True}


async def _load_credential(tenant_id: str, cred_id: str) -> dict:
    c = await db.whatsapp_credentials.find_one({"id": cred_id, "tenant_id": tenant_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Credential not found")
    return c


# ============ Send Message ============
@router.post("/send")
async def send_one(payload: SendMessageIn, current=Depends(get_current_user)):
    cred = await _load_credential(current["tenant_id"], payload.credential_id)
    sid = decrypt_text(cred["account_sid_enc"])
    tok = decrypt_text(cred["auth_token_enc"])

    result = await run_sync(send_whatsapp_via_twilio, sid, tok, cred["whatsapp_from"], payload.to_phone, payload.content)

    # Track conversation
    conv = await db.conversations.find_one(
        {"tenant_id": current["tenant_id"], "customer_phone": payload.to_phone},
        {"_id": 0},
    )
    if not conv:
        conv = {
            "id": uid(),
            "tenant_id": current["tenant_id"],
            "credential_id": payload.credential_id,
            "customer_phone": payload.to_phone,
            "customer_name": payload.to_phone,
            "status": "active",
            "unread_count": 0,
            "lead_score": 50,
            "last_message": payload.content,
            "last_message_at": now().isoformat(),
            "created_at": now().isoformat(),
        }
        await db.conversations.insert_one(conv)
    else:
        await db.conversations.update_one(
            {"id": conv["id"]},
            {"$set": {"last_message": payload.content, "last_message_at": now().isoformat()}},
        )

    await db.messages.insert_one({
        "id": uid(),
        "conversation_id": conv["id"],
        "tenant_id": current["tenant_id"],
        "direction": "outbound",
        "content": payload.content,
        "status": result.get("status", "sent") if result.get("success") else "failed",
        "message_id": result.get("sid", ""),
        "sent_at": now().isoformat(),
        "error": None if result.get("success") else result.get("error"),
    })

    await update_usage(current["tenant_id"], "messages_sent", 1)
    if result.get("success"):
        await update_usage(current["tenant_id"], "messages_delivered", 1)

    return result


# ============ Templates ============
@router.post("/templates")
async def create_template(payload: TemplateIn, current=Depends(get_current_user)):
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "name": payload.name,
        "category": payload.category,
        "body": payload.body,
        "header": payload.header,
        "footer": payload.footer,
        "language": payload.language,
        "status": "approved",  # auto-approve for sandbox
        "created_at": now().isoformat(),
    }
    await db.templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/templates")
async def list_templates(current=Depends(get_current_user)):
    cur = db.templates.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, current=Depends(get_current_user)):
    res = await db.templates.delete_one({"id": template_id, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


# ============ Webhooks (Twilio inbound) ============
@router.post("/webhook/twilio")
async def twilio_inbound(request: Request):
    """Receive incoming WhatsApp messages from Twilio."""
    form = await request.form()
    from_addr = form.get("From", "")  # whatsapp:+1234
    to_addr = form.get("To", "")
    body = form.get("Body", "")
    sid = form.get("MessageSid", "")
    customer_phone = from_addr.replace("whatsapp:", "")

    # Find which tenant owns this 'to' number
    cred = await db.whatsapp_credentials.find_one({"whatsapp_from": to_addr}, {"_id": 0})
    if not cred:
        return PlainTextResponse("<Response/>", media_type="text/xml")
    tenant_id = cred["tenant_id"]

    # Upsert conversation
    conv = await db.conversations.find_one({"tenant_id": tenant_id, "customer_phone": customer_phone}, {"_id": 0})
    if not conv:
        conv = {
            "id": uid(),
            "tenant_id": tenant_id,
            "credential_id": cred["id"],
            "customer_phone": customer_phone,
            "customer_name": customer_phone,
            "status": "active",
            "unread_count": 1,
            "lead_score": 50,
            "last_message": body,
            "last_message_at": now().isoformat(),
            "created_at": now().isoformat(),
        }
        await db.conversations.insert_one(conv)
    else:
        await db.conversations.update_one(
            {"id": conv["id"]},
            {"$inc": {"unread_count": 1},
             "$set": {"last_message": body, "last_message_at": now().isoformat()}},
        )

    # Sentiment + AI suggestion
    sentiment = await run_sync(ai_analyze_sentiment, body)
    suggestion = await run_sync(ai_suggest_reply, body)

    msg_doc = {
        "id": uid(),
        "conversation_id": conv["id"],
        "tenant_id": tenant_id,
        "direction": "inbound",
        "content": body,
        "status": "received",
        "message_id": sid,
        "sent_at": now().isoformat(),
        "ai_response_suggestion": suggestion,
        "sentiment": sentiment.get("sentiment"),
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    await ws_manager.broadcast(tenant_id, {"type": "message", "conversation_id": conv["id"], "message": msg_doc})

    await db.conversations.update_one(
        {"id": conv["id"]},
        {"$set": {"sentiment": sentiment.get("sentiment"), "lead_score": sentiment.get("lead_score", 50)}},
    )

    # Trigger flow engine — may consume the message
    flow_handled = False
    try:
        from flow_engine import trigger_or_continue
        flow_handled = await trigger_or_continue(db, tenant_id, conv, body)
    except Exception as e:
        print(f"[flow_engine] webhook trigger error: {e}")

    # Auto-reply rules — only if a flow didn't already respond
    if flow_handled:
        return PlainTextResponse("<Response/>", media_type="text/xml")

    rules = await db.auto_reply_rules.find(
        {"tenant_id": tenant_id, "credential_id": cred["id"], "is_active": True},
        {"_id": 0},
    ).sort("priority", -1).to_list(50)
    for r in rules:
        keywords = [k.lower() for k in r.get("trigger_keywords", [])]
        body_low = body.lower()
        if r.get("trigger_type") == "always" or any(k in body_low for k in keywords):
            sid_dec = decrypt_text(cred["account_sid_enc"])
            tok_dec = decrypt_text(cred["auth_token_enc"])
            await run_sync(send_whatsapp_via_twilio, sid_dec, tok_dec, cred["whatsapp_from"], customer_phone, r["reply_message"])
            await db.messages.insert_one({
                "id": uid(),
                "conversation_id": conv["id"],
                "tenant_id": tenant_id,
                "direction": "outbound",
                "content": r["reply_message"],
                "status": "sent",
                "auto_reply_used": True,
                "sent_at": now().isoformat(),
            })
            break

    return PlainTextResponse("<Response/>", media_type="text/xml")


@router.post("/webhook/twilio/status")
async def twilio_status(request: Request):
    form = await request.form()
    sid = form.get("MessageSid", "")
    status = form.get("MessageStatus", "")
    if sid:
        await db.messages.update_one({"message_id": sid}, {"$set": {"status": status}})
    return {"ok": True}


# ============ Sandbox / Simulate (for preview without live Twilio) ============
@router.post("/simulate-inbound")
async def simulate_inbound(body: dict, current=Depends(get_current_user)):
    """Useful for preview/demo: simulate an incoming WhatsApp message."""
    customer_phone = body.get("from_phone", "+919876543210")
    text = body.get("text", "Hello, I am interested in your product")
    cred_id = body.get("credential_id")

    cred = await _load_credential(current["tenant_id"], cred_id)

    conv = await db.conversations.find_one(
        {"tenant_id": current["tenant_id"], "customer_phone": customer_phone}, {"_id": 0}
    )
    if not conv:
        conv = {
            "id": uid(),
            "tenant_id": current["tenant_id"],
            "credential_id": cred["id"],
            "customer_phone": customer_phone,
            "customer_name": body.get("from_name", customer_phone),
            "status": "active",
            "unread_count": 1,
            "lead_score": 50,
            "last_message": text,
            "last_message_at": now().isoformat(),
            "created_at": now().isoformat(),
        }
        await db.conversations.insert_one(conv)
    else:
        await db.conversations.update_one(
            {"id": conv["id"]},
            {"$inc": {"unread_count": 1},
             "$set": {"last_message": text, "last_message_at": now().isoformat()}},
        )

    sentiment = await run_sync(ai_analyze_sentiment, text)
    suggestion = await run_sync(ai_suggest_reply, text)

    msg_id = uid()
    msg_doc = {
        "id": msg_id,
        "conversation_id": conv["id"],
        "tenant_id": current["tenant_id"],
        "direction": "inbound",
        "content": text,
        "status": "received",
        "sent_at": now().isoformat(),
        "ai_response_suggestion": suggestion,
        "sentiment": sentiment.get("sentiment"),
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    await ws_manager.broadcast(current["tenant_id"], {"type": "message", "conversation_id": conv["id"], "message": msg_doc})

    await db.conversations.update_one(
        {"id": conv["id"]},
        {"$set": {"sentiment": sentiment.get("sentiment"), "lead_score": sentiment.get("lead_score", 50)}},
    )

    # Trigger active chatbot flow (if any)
    try:
        from flow_engine import trigger_or_continue
        await trigger_or_continue(db, current["tenant_id"], conv, text)
    except Exception as e:
        print(f"[flow_engine] simulate trigger error: {e}")

    return {"ok": True, "conversation_id": conv["id"], "message_id": msg_id, "suggestion": suggestion}
