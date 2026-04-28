"""Bulk campaigns with rate limiting + approval workflow"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from server import db
from models import CampaignIn, CampaignApprove, uid, now
from helpers import (
    get_current_user, decrypt_text, audit_log,
    send_whatsapp, send_whatsapp_billed, update_usage, run_sync,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("")
async def create_campaign(payload: CampaignIn, current=Depends(get_current_user)):
    cred = await db.whatsapp_credentials.find_one(
        {"id": payload.credential_id, "tenant_id": current["tenant_id"]}, {"_id": 0},
    )
    if not cred:
        raise HTTPException(404, "Credential not found")

    cid = uid()
    # Normalize recipients
    recipients = [r.strip() for r in payload.recipients if r and r.strip()]

    # Resolve template (optional). If template_id is set and message is blank, derive message from template body.
    template_doc = None
    if payload.template_id:
        template_doc = await db.templates.find_one(
            {"id": payload.template_id, "tenant_id": current["tenant_id"]},
            {"_id": 0},
        )
        if not template_doc:
            raise HTTPException(400, "Template not found in your workspace")
        if not (payload.message or "").strip():
            composed = "\n\n".join([s for s in [
                template_doc.get("header"),
                template_doc.get("body"),
                template_doc.get("footer"),
            ] if s])
            payload.message = composed
        if (payload.media_url is None) and template_doc.get("media_url"):
            payload.media_url = template_doc.get("media_url")
            payload.media_type = template_doc.get("media_type") or "image"

    # Reject completely empty messages (after template resolution + variants check)
    if not (payload.message or "").strip() and not payload.variants:
        raise HTTPException(400, "Message is required (provide text, pick a template, or add A/B variants)")

    # Prepare variants for A/B testing
    variants_in = [v.model_dump() if hasattr(v, "model_dump") else dict(v) for v in (payload.variants or [])]
    if variants_in:
        total_weight = sum(int(v.get("weight", 0)) for v in variants_in)
        if total_weight <= 0 or total_weight > 100:
            raise HTTPException(400, "Variant weights must sum between 1 and 100")
        # Initialize per-variant counters
        for v in variants_in:
            v["sent_count"] = 0
            v["delivered_count"] = 0
            v["failed_count"] = 0

    doc = {
        "id": cid,
        "tenant_id": current["tenant_id"],
        "credential_id": payload.credential_id,
        "name": payload.name,
        "message": payload.message,
        "media_url": payload.media_url,
        "media_type": payload.media_type,
        "template_id": payload.template_id,
        "template_name": (template_doc or {}).get("name"),
        "variants": variants_in,
        "is_ab_test": bool(variants_in),
        "status": "pending_approval",
        "total_recipients": len(recipients),
        "sent_count": 0,
        "delivered_count": 0,
        "failed_count": 0,
        "recipients": recipients,
        "schedule_at": payload.schedule_at.isoformat() if payload.schedule_at else None,
        "created_by": current["id"],
        "created_at": now().isoformat(),
    }
    await db.campaigns.insert_one(doc)
    await audit_log(current["tenant_id"], current["id"], "create_campaign", cid, {"name": payload.name, "count": len(recipients)})
    doc.pop("_id", None)
    return doc


@router.get("")
async def list_campaigns(current=Depends(get_current_user)):
    cur = db.campaigns.find(
        {"tenant_id": current["tenant_id"]},
        {"_id": 0, "recipients": 0},  # don't ship recipients
    ).sort("created_at", -1)
    return await cur.to_list(200)


@router.get("/{cid}")
async def get_campaign(cid: str, current=Depends(get_current_user)):
    c = await db.campaigns.find_one({"id": cid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return c


@router.post("/{cid}/approve")
async def approve_campaign(cid: str, payload: CampaignApprove, background_tasks: BackgroundTasks, current=Depends(get_current_user)):
    c = await db.campaigns.find_one({"id": cid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    if c["status"] != "pending_approval":
        raise HTTPException(400, "Campaign not in pending state")

    if not payload.approve:
        await db.campaigns.update_one({"id": cid}, {"$set": {"status": "rejected"}})
        return {"status": "rejected"}

    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {"status": "running", "started_at": now().isoformat()}},
    )
    await audit_log(current["tenant_id"], current["id"], "approve_campaign", cid)
    background_tasks.add_task(_run_campaign, cid)
    return {"status": "running"}


@router.post("/{cid}/pause")
async def pause_campaign(cid: str, current=Depends(get_current_user)):
    await db.campaigns.update_one(
        {"id": cid, "tenant_id": current["tenant_id"]},
        {"$set": {"status": "paused"}},
    )
    return {"status": "paused"}


@router.post("/{cid}/resume")
async def resume_campaign(cid: str, background_tasks: BackgroundTasks, current=Depends(get_current_user)):
    c = await db.campaigns.find_one({"id": cid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    if c["status"] != "paused":
        raise HTTPException(400, "Campaign is not paused")
    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {"status": "running", "resumed_at": now().isoformat()}},
    )
    await audit_log(current["tenant_id"], current["id"], "resume_campaign", cid)
    background_tasks.add_task(_run_campaign, cid)
    return {"status": "running"}


async def _run_campaign(cid: str):
    """Background task to send campaign messages with rate limiting + optional A/B variants."""
    import random
    c = await db.campaigns.find_one({"id": cid}, {"_id": 0})
    if not c:
        return
    cred = await db.whatsapp_credentials.find_one({"id": c["credential_id"]}, {"_id": 0})
    if not cred:
        return
    sent = c.get("sent_count", 0)
    delivered = c.get("delivered_count", 0)
    failed = c.get("failed_count", 0)
    # Skip already-sent recipients on resume
    already_sent = sent
    recipients_remaining = c.get("recipients", [])[already_sent:]

    variants = c.get("variants") or []
    is_ab = bool(variants)

    def pick_variant(idx: int) -> int | None:
        """Return variant index based on cumulative weights and a deterministic seed (idx)."""
        if not is_ab:
            return None
        total = sum(int(v.get("weight", 0)) for v in variants)
        if total <= 0:
            return None
        # Deterministic per-recipient: hash(idx) % total
        rnd = random.Random(f"{cid}:{idx}")
        roll = rnd.randint(1, total)
        cum = 0
        for i, v in enumerate(variants):
            cum += int(v.get("weight", 0))
            if roll <= cum:
                return i
        return 0

    for offset, phone in enumerate(recipients_remaining):
        # Check pause status
        cc = await db.campaigns.find_one({"id": cid}, {"_id": 0, "status": 1})
        if cc and cc.get("status") in ("paused", "rejected"):
            break

        v_idx = pick_variant(already_sent + offset)
        if v_idx is not None:
            v = variants[v_idx]
            msg_text = v.get("message") or c["message"]
            mu = v.get("media_url") or c.get("media_url")
            mt = v.get("media_type") or c.get("media_type")
        else:
            msg_text = c["message"]
            mu = c.get("media_url")
            mt = c.get("media_type")

        result = await send_whatsapp_billed(
            db, c["tenant_id"], cred, phone, msg_text, mu, mt,
            category="marketing", note=f"Campaign: {c.get('name', '')[:40]}",
        )
        sent += 1
        if result.get("success"):
            delivered += 1
        else:
            failed += 1
            # If wallet ran dry, pause the campaign and stop processing
            if (result.get("billing") or {}).get("reason") == "insufficient_balance":
                await db.campaigns.update_one(
                    {"id": cid},
                    {"$set": {"status": "paused", "paused_reason": "insufficient_wallet_balance",
                              "sent_count": sent, "delivered_count": delivered, "failed_count": failed}},
                )
                return

        # Track in conversations & messages
        conv = await db.conversations.find_one(
            {"tenant_id": c["tenant_id"], "customer_phone": phone}, {"_id": 0},
        )
        if not conv:
            conv = {
                "id": uid(),
                "tenant_id": c["tenant_id"],
                "credential_id": c["credential_id"],
                "customer_phone": phone,
                "customer_name": phone,
                "status": "active",
                "unread_count": 0,
                "lead_score": 50,
                "last_message": msg_text,
                "last_message_at": now().isoformat(),
                "created_at": now().isoformat(),
            }
            await db.conversations.insert_one(conv)
        await db.messages.insert_one({
            "id": uid(),
            "conversation_id": conv["id"],
            "tenant_id": c["tenant_id"],
            "direction": "outbound",
            "content": msg_text,
            "media_url": mu,
            "media_type": mt,
            "status": "sent" if result.get("success") else "failed",
            "campaign_id": cid,
            "variant_index": v_idx,
            "variant_name": variants[v_idx]["name"] if v_idx is not None else None,
            "message_id": result.get("sid", ""),
            "sent_at": now().isoformat(),
            "error": None if result.get("success") else result.get("error"),
        })

        # Increment per-variant counter
        if v_idx is not None:
            inc_field = f"variants.{v_idx}.sent_count"
            del_field = f"variants.{v_idx}.delivered_count"
            fail_field = f"variants.{v_idx}.failed_count"
            inc: dict = {inc_field: 1}
            if result.get("success"):
                inc[del_field] = 1
            else:
                inc[fail_field] = 1
            await db.campaigns.update_one({"id": cid}, {"$inc": inc})

        # Persist progress every 10 messages
        if sent % 10 == 0:
            await db.campaigns.update_one(
                {"id": cid},
                {"$set": {"sent_count": sent, "delivered_count": delivered, "failed_count": failed}},
            )

        await update_usage(c["tenant_id"], "messages_sent", 1)
        # Rate limit: ~10/sec
        await asyncio.sleep(0.1)

    final_status = "completed"
    cc = await db.campaigns.find_one({"id": cid}, {"_id": 0, "status": 1})
    if cc and cc.get("status") == "paused":
        final_status = "paused"
    await db.campaigns.update_one(
        {"id": cid},
        {"$set": {
            "status": final_status,
            "sent_count": sent,
            "delivered_count": delivered,
            "failed_count": failed,
            "completed_at": now().isoformat() if final_status == "completed" else None,
        }},
    )
