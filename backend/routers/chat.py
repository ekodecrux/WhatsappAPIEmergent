"""Chat: conversations, messages, leads, auto-reply rules"""
from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import (
    LeadIn, LeadUpdate, SendMessageIn, AutoReplyRuleIn, ConversationCreateIn,
    uid, now,
)
from helpers import (
    get_current_user, decrypt_text, audit_log,
    send_whatsapp, ai_suggest_reply, update_usage, run_sync,
)
from ws_manager import ws_manager

router = APIRouter(tags=["chat-leads"])


# ============ Conversations ============
@router.get("/conversations")
async def list_conversations(current=Depends(get_current_user)):
    cur = db.conversations.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("last_message_at", -1)
    return await cur.to_list(500)


@router.post("/conversations")
async def create_conversation(payload: ConversationCreateIn, current=Depends(get_current_user)):
    existing = await db.conversations.find_one(
        {"tenant_id": current["tenant_id"], "customer_phone": payload.customer_phone}, {"_id": 0},
    )
    if existing:
        return existing
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "credential_id": payload.credential_id,
        "customer_phone": payload.customer_phone,
        "customer_name": payload.customer_name or payload.customer_phone,
        "status": "active",
        "unread_count": 0,
        "lead_score": 50,
        "last_message": "",
        "last_message_at": now().isoformat(),
        "created_at": now().isoformat(),
    }
    await db.conversations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: str, current=Depends(get_current_user)):
    # Verify ownership
    conv = await db.conversations.find_one({"id": conv_id, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    cur = db.messages.find({"conversation_id": conv_id}, {"_id": 0}).sort("sent_at", 1)
    msgs = await cur.to_list(1000)
    # Mark as read
    await db.conversations.update_one({"id": conv_id}, {"$set": {"unread_count": 0}})
    return msgs


@router.post("/conversations/{conv_id}/send")
async def send_in_conversation(conv_id: str, payload: SendMessageIn, current=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Conversation not found")
    cred = await db.whatsapp_credentials.find_one(
        {"id": payload.credential_id, "tenant_id": current["tenant_id"]}, {"_id": 0}
    )
    if not cred:
        raise HTTPException(404, "Credential not found")

    from helpers import send_whatsapp_billed
    result = await send_whatsapp_billed(
        db, current["tenant_id"], cred, conv["customer_phone"], payload.content,
        payload.media_url, payload.media_type, category="service",
        note="Live chat reply",
    )

    msg_doc = {
        "id": uid(),
        "conversation_id": conv_id,
        "tenant_id": current["tenant_id"],
        "direction": "outbound",
        "content": payload.content,
        "media_url": payload.media_url,
        "media_type": payload.media_type,
        "status": result.get("status", "sent") if result.get("success") else "failed",
        "message_id": result.get("sid", ""),
        "sent_at": now().isoformat(),
        "error": None if result.get("success") else result.get("error"),
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    await db.conversations.update_one(
        {"id": conv_id},
        {"$set": {"last_message": payload.content, "last_message_at": now().isoformat()}},
    )
    await update_usage(current["tenant_id"], "messages_sent", 1)
    # Realtime broadcast
    await ws_manager.broadcast(current["tenant_id"], {
        "type": "message",
        "conversation_id": conv_id,
        "message": msg_doc,
    })
    return {"success": result.get("success", False), "message": msg_doc}


@router.get("/conversations/{conv_id}/ai-suggestion")
async def get_ai_suggestion(conv_id: str, current=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": conv_id, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Not found")
    last_inbound = await db.messages.find_one(
        {"conversation_id": conv_id, "direction": "inbound"}, {"_id": 0}, sort=[("sent_at", -1)]
    )
    if not last_inbound:
        return {"suggestion": "Hello! How can we help you today?"}
    suggestion = ai_suggest_reply(last_inbound["content"])
    return {"suggestion": suggestion}


# ============ Leads ============
@router.post("/leads")
async def create_lead(payload: LeadIn, current=Depends(get_current_user)):
    existing = await db.leads.find_one({"tenant_id": current["tenant_id"], "phone": payload.phone}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Lead with this phone already exists")
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "phone": payload.phone,
        "name": payload.name or payload.phone,
        "email": payload.email,
        "company": payload.company,
        "source": payload.source,
        "status": "new",
        "lead_score": 50,
        "notes": payload.notes,
        "custom_fields": payload.custom_fields or {},
        "created_at": now().isoformat(),
    }
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/leads")
async def list_leads(current=Depends(get_current_user), status: str | None = None, source: str | None = None):
    q = {"tenant_id": current["tenant_id"]}
    if status:
        q["status"] = status
    if source:
        q["source"] = source
    cur = db.leads.find(q, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(1000)


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdate, current=Depends(get_current_user)):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        return {"updated": 0}
    upd["updated_at"] = now().isoformat()
    res = await db.leads.update_one({"id": lead_id, "tenant_id": current["tenant_id"]}, {"$set": upd})
    return {"updated": res.modified_count}


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, current=Depends(get_current_user)):
    res = await db.leads.delete_one({"id": lead_id, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


@router.post("/leads/import")
async def import_leads(body: dict, current=Depends(get_current_user)):
    """Bulk import: { items: [{phone, name, email, company}] }"""
    items = body.get("items", [])
    inserted = 0
    skipped = 0
    for it in items:
        phone = (it.get("phone") or "").strip()
        if not phone:
            skipped += 1
            continue
        if await db.leads.find_one({"tenant_id": current["tenant_id"], "phone": phone}):
            skipped += 1
            continue
        await db.leads.insert_one({
            "id": uid(),
            "tenant_id": current["tenant_id"],
            "phone": phone,
            "name": it.get("name") or phone,
            "email": it.get("email"),
            "company": it.get("company"),
            "source": it.get("source", "import"),
            "status": "new",
            "lead_score": 50,
            "created_at": now().isoformat(),
        })
        inserted += 1
    return {"inserted": inserted, "skipped": skipped}


@router.post("/leads/scrape-url")
async def scrape_url_for_leads(body: dict, current=Depends(get_current_user)):
    """Polite public-page phone-number discovery.

    Use when a merchant doesn't yet have a contact list. Fetches the given URL, extracts
    E.164-looking phone numbers + nearby names (best-effort), and returns them as a preview.
    Caller chooses which rows to import — NO numbers are added automatically.

    Legal/compliance note: only use on your OWN pages or with consent. WhatsApp Business
    Solution Terms prohibit messaging users who have not opted-in.
    """
    import re
    import httpx
    url = (body.get("url") or "").strip()
    country_hint = (body.get("country_code") or "+91").strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(400, "URL must start with http:// or https://")
    # Polite single-page fetch with UA + 10s timeout
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            headers = {"User-Agent": "wabridge-lead-discoverer/1.0 (+https://wabridge.com/bot)"}
            r = await client.get(url, headers=headers)
            if r.status_code >= 400:
                raise HTTPException(400, f"Remote returned HTTP {r.status_code}")
            html = r.text
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Could not fetch URL: {str(e)[:200]}")

    # Strip scripts + style blocks, then pull text
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    # Extract phone numbers (Indian + international)
    phone_patterns = [
        r"\+?\d[\d\s\-().]{8,18}\d",   # loose generic
    ]
    found: set[str] = set()
    for p in phone_patterns:
        for m in re.finditer(p, text):
            raw = re.sub(r"[\s\-().]", "", m.group(0))
            if not raw:
                continue
            if raw.startswith("+"):
                e164 = raw
            elif raw.startswith("0"):
                e164 = country_hint + raw.lstrip("0")
            elif len(raw) == 10 and country_hint.startswith("+"):
                e164 = country_hint + raw
            else:
                e164 = "+" + raw if not raw.startswith("+") else raw
            # Validate length 10–15 digits after +
            digits = re.sub(r"\D", "", e164)
            if 10 <= len(digits) <= 15:
                found.add("+" + digits)

    # Email addresses as bonus info
    emails = set(re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text))

    # Simple name guess — scrape <title>
    title_match = re.search(r"<title[^>]*>([^<]{2,120})</title>", html, flags=re.I)
    page_title = title_match.group(1).strip() if title_match else ""

    # Mark duplicates (already present in tenant CRM)
    existing_cur = db.leads.find(
        {"tenant_id": current["tenant_id"], "phone": {"$in": list(found)}},
        {"_id": 0, "phone": 1},
    )
    existing = {d["phone"] for d in await existing_cur.to_list(500)}
    rows = [{"phone": p, "duplicate": p in existing, "source": "web_scrape"} for p in sorted(found)]
    return {
        "url": url,
        "page_title": page_title,
        "phones_found": len(found),
        "duplicates": len(existing),
        "rows": rows[:100],
        "emails_found": sorted(list(emails))[:20],
        "disclaimer": "WhatsApp requires opt-in consent before messaging. Only import numbers you have permission to contact.",
    }


# ============ Auto-reply rules ============
@router.post("/auto-reply-rules")
async def create_rule(payload: AutoReplyRuleIn, current=Depends(get_current_user)):
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "credential_id": payload.credential_id,
        "name": payload.name,
        "trigger_keywords": payload.trigger_keywords,
        "trigger_type": payload.trigger_type,
        "reply_message": payload.reply_message,
        "is_active": payload.is_active,
        "priority": payload.priority,
        "created_at": now().isoformat(),
    }
    await db.auto_reply_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/auto-reply-rules")
async def list_rules(current=Depends(get_current_user)):
    cur = db.auto_reply_rules.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("priority", -1)
    return await cur.to_list(200)


@router.delete("/auto-reply-rules/{rule_id}")
async def delete_rule(rule_id: str, current=Depends(get_current_user)):
    res = await db.auto_reply_rules.delete_one({"id": rule_id, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


@router.patch("/auto-reply-rules/{rule_id}")
async def update_rule(rule_id: str, body: dict, current=Depends(get_current_user)):
    allowed = {"name", "trigger_keywords", "trigger_type", "reply_message", "is_active", "priority"}
    upd = {k: v for k, v in body.items() if k in allowed}
    if not upd:
        return {"updated": 0}
    res = await db.auto_reply_rules.update_one({"id": rule_id, "tenant_id": current["tenant_id"]}, {"$set": upd})
    return {"updated": res.modified_count}
