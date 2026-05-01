"""WhatsApp credentials, message send, templates, webhooks"""
import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse

from server import db
from models import CredentialIn, CredentialOut, TemplateIn, SendMessageIn, uid, now
from helpers import (
    get_current_user, encrypt_text, decrypt_text, mask, audit_log,
    send_whatsapp, validate_twilio_credentials, update_usage,
    ai_suggest_reply, ai_analyze_sentiment, run_sync,
    validate_meta_credentials,
)
from ws_manager import ws_manager

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ============ Credentials ============
@router.post("/credentials", response_model=CredentialOut)
async def add_credential(payload: CredentialIn, current=Depends(get_current_user)):
    if payload.provider not in ("twilio", "twilio_sandbox", "meta_cloud"):
        raise HTTPException(400, "Unsupported provider")

    is_valid = True
    meta_phone_display = ""
    if payload.provider == "twilio_sandbox":
        # Use platform's Twilio sandbox; no user creds required
        sid = os.environ["TWILIO_ACCOUNT_SID"]
        tok = os.environ["TWILIO_AUTH_TOKEN"]
        wfrom = os.environ["TWILIO_WHATSAPP_FROM"]
    elif payload.provider == "twilio":
        if not (payload.account_sid and payload.auth_token and payload.whatsapp_from):
            raise HTTPException(400, "Twilio requires account_sid, auth_token and whatsapp_from")
        is_valid = await run_sync(validate_twilio_credentials, payload.account_sid, payload.auth_token)
        if not is_valid:
            raise HTTPException(400, "Twilio credentials validation failed")
        sid, tok, wfrom = payload.account_sid, payload.auth_token, payload.whatsapp_from
    else:  # meta_cloud
        if not (payload.access_token and payload.phone_number_id):
            raise HTTPException(400, "Meta Cloud requires access_token and phone_number_id")
        verify = await run_sync(validate_meta_credentials, payload.access_token, payload.phone_number_id)
        if not verify.get("success"):
            raise HTTPException(400, f"Meta credentials invalid: {verify.get('error', 'verification failed')}")
        meta_phone_display = verify.get("display_phone_number") or ""
        sid, tok = "", payload.access_token
        # Store the verified WhatsApp number so it shows in the UI and can be used for outbound
        wfrom = (f"+{meta_phone_display}" if meta_phone_display and not meta_phone_display.startswith("+") else meta_phone_display)

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


@router.get("/credentials/{cred_id}/share-links")
async def get_share_links(cred_id: str, current=Depends(get_current_user)):
    """Generate wa.me link + SVG QR code for a connected number — for promotion."""
    import urllib.parse
    c = await db.whatsapp_credentials.find_one(
        {"id": cred_id, "tenant_id": current["tenant_id"]}, {"_id": 0},
    )
    if not c:
        raise HTTPException(404, "Credential not found")
    raw = (c.get("whatsapp_from", "") or "").lstrip("+").replace("whatsapp:", "").strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        raise HTTPException(400, "This credential has no whatsapp_from number set")

    default_msg = f"Hi! I'd like to know more about {(await db.tenants.find_one({'id': current['tenant_id']}, {'_id': 0, 'company_name': 1}) or {}).get('company_name', 'your business')}"
    encoded = urllib.parse.quote(default_msg)

    wa_link = f"https://wa.me/{digits}?text={encoded}"
    short_link = f"https://wa.me/{digits}"

    # Inline QR code SVG (use external service that returns SVG via redirect — keep payload tiny)
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?data={urllib.parse.quote(short_link)}&size=300x300&format=svg&margin=0"

    return {
        "phone": "+" + digits,
        "wa_link": wa_link,
        "wa_link_short": short_link,
        "qr_image_url": qr_url,
        "default_message": default_msg,
        "embed_snippet": (
            f'<a href="{wa_link}" target="_blank" rel="noopener">'
            f'<img src="https://img.shields.io/badge/Chat_on-WhatsApp-25D366?logo=whatsapp&logoColor=white" alt="Chat on WhatsApp"/>'
            f'</a>'
        ),
    }



async def _load_credential(tenant_id: str, cred_id: str) -> dict:
    c = await db.whatsapp_credentials.find_one({"id": cred_id, "tenant_id": tenant_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Credential not found")
    return c


# ============ Send Message ============
@router.post("/send")
async def send_one(payload: SendMessageIn, current=Depends(get_current_user)):
    cred = await _load_credential(current["tenant_id"], payload.credential_id)
    from helpers import send_whatsapp_billed
    result = await send_whatsapp_billed(
        db, current["tenant_id"], cred, payload.to_phone, payload.content,
        payload.media_url, payload.media_type, category="marketing",
        note="Manual /send",
    )

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
        "media_url": payload.media_url,
        "media_type": payload.media_type,
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

    # Capture inbound media (Twilio sends MediaUrl0 + MediaContentType0 ...)
    media_url = form.get("MediaUrl0") or None
    media_ct = form.get("MediaContentType0") or ""
    media_type = None
    if media_url and media_ct:
        if media_ct.startswith("image/"):
            media_type = "image"
        elif media_ct.startswith("audio/"):
            media_type = "audio"
        elif media_ct.startswith("video/"):
            media_type = "video"
        else:
            media_type = "document"

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

    # Detect language only once per conversation to save AI calls
    if not conv.get("preferred_language") and body and len(body.strip()) >= 3:
        try:
            from flow_translate import detect_language
            lang = await run_sync(detect_language, body)
            if lang:
                await db.conversations.update_one({"id": conv["id"]}, {"$set": {"preferred_language": lang}})
                conv["preferred_language"] = lang
        except Exception:
            pass

    msg_doc = {
        "id": uid(),
        "conversation_id": conv["id"],
        "tenant_id": tenant_id,
        "direction": "inbound",
        "content": body,
        "media_url": media_url,
        "media_type": media_type,
        "status": "received",
        "message_id": sid,
        "sent_at": now().isoformat(),
        "ai_response_suggestion": suggestion,
        "sentiment": sentiment.get("sentiment"),
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    await ws_manager.broadcast(tenant_id, {"type": "message", "conversation_id": conv["id"], "message": msg_doc})

    try:
        from erp_dispatcher import dispatch_event
        await dispatch_event(db, tenant_id, "message.received", {
            "id": msg_doc["id"], "conversation_id": conv["id"],
            "from_phone": customer_phone, "content": body,
            "media_url": media_url, "media_type": media_type,
            "sentiment": sentiment.get("sentiment"),
            "lead_score": sentiment.get("lead_score", 50),
            "provider": "twilio",
        })
    except Exception as e:
        print(f"[erp_dispatch] twilio inbound: {e}")

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
            await run_sync(send_whatsapp, cred, customer_phone, r["reply_message"])
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
        msg = await db.messages.find_one({"message_id": sid}, {"_id": 0})
        if msg:
            try:
                from erp_dispatcher import dispatch_event
                await dispatch_event(db, msg["tenant_id"], "message.status", {
                    "id": msg["id"], "conversation_id": msg.get("conversation_id"),
                    "provider_id": sid, "status": status,
                    "to_phone": msg.get("to_phone"),
                })
            except Exception as e:
                print(f"[erp_dispatch] twilio status: {e}")
    return {"ok": True}


# ============ Meta Cloud webhook ============
@router.get("/webhook/meta")
async def meta_webhook_verify(request: Request):
    """Meta sends a GET with hub.challenge for webhook verification."""
    qp = request.query_params
    mode = qp.get("hub.mode")
    token = qp.get("hub.verify_token")
    challenge = qp.get("hub.challenge")
    expected = os.environ.get("META_VERIFY_TOKEN", "wabridge-meta-verify")
    if mode == "subscribe" and token == expected and challenge:
        return PlainTextResponse(challenge)
    return PlainTextResponse("forbidden", status_code=403)


@router.post("/webhook/meta")
async def meta_webhook_inbound(request: Request):
    """Receive Meta Cloud WhatsApp webhooks (messages + statuses).

    Verifies X-Hub-Signature-256 against META_APP_SECRET. If the secret is not set
    the verification is skipped (dev mode) — set META_APP_SECRET in production.
    """
    raw = await request.body()
    sig = request.headers.get("X-Hub-Signature-256") or request.headers.get("x-hub-signature-256")
    from helpers import verify_meta_webhook_signature
    if not verify_meta_webhook_signature(raw, sig):
        return PlainTextResponse("invalid signature", status_code=401)
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except Exception:
        return {"ok": True}
    try:
        for entry in body.get("entry", []):
            for ch in entry.get("changes", []):
                value = ch.get("value", {})
                metadata = value.get("metadata", {})
                phone_number_id = metadata.get("phone_number_id")
                cred = await db.whatsapp_credentials.find_one(
                    {"phone_number_id": phone_number_id, "provider": "meta_cloud"},
                    {"_id": 0},
                )
                if not cred:
                    continue
                tenant_id = cred["tenant_id"]

                # Status updates
                for st in value.get("statuses", []) or []:
                    msg_id = st.get("id")
                    status = st.get("status")
                    if msg_id and status:
                        await db.messages.update_one({"message_id": msg_id}, {"$set": {"status": status}})
                        msg = await db.messages.find_one({"message_id": msg_id}, {"_id": 0})
                        if msg:
                            try:
                                from erp_dispatcher import dispatch_event
                                await dispatch_event(db, msg["tenant_id"], "message.status", {
                                    "id": msg["id"], "provider_id": msg_id, "status": status,
                                    "conversation_id": msg.get("conversation_id"),
                                })
                            except Exception as e:
                                print(f"[erp_dispatch] meta status: {e}")

                # Inbound messages
                for m in value.get("messages", []) or []:
                    if m.get("type") != "text":
                        continue
                    customer_phone = "+" + m.get("from", "")
                    text_body = (m.get("text") or {}).get("body", "")
                    sid = m.get("id", "")
                    referral = m.get("referral")  # CTWA ad referral payload

                    conv = await db.conversations.find_one(
                        {"tenant_id": tenant_id, "customer_phone": customer_phone}, {"_id": 0},
                    )
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
                            "last_message": text_body,
                            "last_message_at": now().isoformat(),
                            "created_at": now().isoformat(),
                            "referral": referral,  # CTWA attribution
                            "source": "ctwa" if referral else "organic",
                        }
                        await db.conversations.insert_one(conv)
                    else:
                        upd = {"last_message": text_body, "last_message_at": now().isoformat()}
                        if referral and not conv.get("referral"):
                            upd["referral"] = referral
                            upd["source"] = "ctwa"
                        await db.conversations.update_one(
                            {"id": conv["id"]},
                            {"$inc": {"unread_count": 1}, "$set": upd},
                        )

                    sentiment = await run_sync(ai_analyze_sentiment, text_body)
                    suggestion = await run_sync(ai_suggest_reply, text_body)

                    if not conv.get("preferred_language") and text_body and len(text_body.strip()) >= 3:
                        try:
                            from flow_translate import detect_language
                            lang = await run_sync(detect_language, text_body)
                            if lang:
                                await db.conversations.update_one({"id": conv["id"]}, {"$set": {"preferred_language": lang}})
                                conv["preferred_language"] = lang
                        except Exception:
                            pass

                    msg_doc = {
                        "id": uid(),
                        "conversation_id": conv["id"],
                        "tenant_id": tenant_id,
                        "direction": "inbound",
                        "content": text_body,
                        "status": "received",
                        "message_id": sid,
                        "sent_at": now().isoformat(),
                        "ai_response_suggestion": suggestion,
                        "sentiment": sentiment.get("sentiment"),
                    }
                    await db.messages.insert_one(msg_doc)
                    msg_doc.pop("_id", None)
                    await ws_manager.broadcast(tenant_id, {"type": "message", "conversation_id": conv["id"], "message": msg_doc})

                    try:
                        from erp_dispatcher import dispatch_event
                        await dispatch_event(db, tenant_id, "message.received", {
                            "id": msg_doc["id"], "conversation_id": conv["id"],
                            "from_phone": customer_phone, "content": text_body,
                            "provider": "meta_cloud", "provider_id": sid,
                        })
                    except Exception as e:
                        print(f"[erp_dispatch] meta inbound: {e}")

                    try:
                        from flow_engine import trigger_or_continue
                        await trigger_or_continue(db, tenant_id, conv, text_body)
                    except Exception as e:
                        print(f"[flow_engine] meta webhook error: {e}")
    except Exception as e:
        print(f"[meta_webhook] error: {e}")
    return {"ok": True}


# ============ Sandbox info & test-send ============
@router.get("/sandbox-info")
async def sandbox_info(current=Depends(get_current_user)):
    """Return Twilio sandbox join instructions for the tenant.

    The sandbox 'join code' is unique per Twilio account — fetched live from Twilio.
    """
    wfrom = os.environ["TWILIO_WHATSAPP_FROM"]
    join_keyword = os.environ.get("TWILIO_SANDBOX_KEYWORD", "")
    phone = wfrom.replace("whatsapp:", "")
    return {
        "sandbox_phone": phone,
        "join_keyword": join_keyword or "(open Twilio Console → Messaging → Try WhatsApp to find your join code)",
        "instructions": (
            f"To receive sandbox messages on real WhatsApp, send 'join <your-keyword>' from the recipient's "
            f"WhatsApp to {phone}. Twilio will reply confirming opt-in. Without this, sandbox messages will fail."
        ),
        "console_url": "https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn",
    }


@router.post("/test-send")
async def test_send(body: dict, current=Depends(get_current_user)):
    """Send a test WhatsApp message using a saved credential. Returns Twilio/Meta error verbatim if any."""
    cred_id = body.get("credential_id")
    to_phone = (body.get("to_phone") or "").strip()
    text = (body.get("text") or "Hello from wabridge — this is a test message.").strip()
    if not cred_id or not to_phone:
        raise HTTPException(400, "credential_id and to_phone required")
    if not to_phone.startswith("+"):
        raise HTTPException(400, "to_phone must be in E.164 format (e.g., +919876543210)")
    cred = await _load_credential(current["tenant_id"], cred_id)
    result = await run_sync(send_whatsapp, cred, to_phone, text)
    # Persist the test message so it appears in chat + delivery dashboard
    conv = await db.conversations.find_one(
        {"tenant_id": current["tenant_id"], "customer_phone": to_phone}, {"_id": 0},
    )
    if not conv:
        conv = {
            "id": uid(),
            "tenant_id": current["tenant_id"],
            "credential_id": cred_id,
            "customer_phone": to_phone,
            "customer_name": to_phone,
            "status": "active",
            "unread_count": 0,
            "lead_score": 50,
            "last_message": text,
            "last_message_at": now().isoformat(),
            "created_at": now().isoformat(),
        }
        await db.conversations.insert_one(conv)
    await db.messages.insert_one({
        "id": uid(),
        "conversation_id": conv["id"],
        "tenant_id": current["tenant_id"],
        "direction": "outbound",
        "content": text,
        "status": result.get("status", "sent") if result.get("success") else "failed",
        "message_id": result.get("sid", ""),
        "sent_at": now().isoformat(),
        "error": None if result.get("success") else result.get("error"),
    })
    if not result.get("success"):
        # Map Twilio's "not opted in" to a clearer message
        err = (result.get("error") or "").lower()
        hint = None
        if "63007" in err or "not opt" in err or "63015" in err or "63016" in err or "63018" in err:
            hint = (
                "Recipient has not joined the Twilio sandbox. From the recipient's WhatsApp, "
                "send 'join <your-keyword>' to +14155238886. Find your keyword in the Twilio "
                "Console → Messaging → Try WhatsApp."
            )
        return {**result, "hint": hint}
    return result


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

    # Detect & cache language for this conversation
    if not conv.get("preferred_language") and text and len(text.strip()) >= 3:
        try:
            from flow_translate import detect_language
            lang = await run_sync(detect_language, text)
            if lang:
                await db.conversations.update_one({"id": conv["id"]}, {"$set": {"preferred_language": lang}})
                conv["preferred_language"] = lang
        except Exception:
            pass

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
