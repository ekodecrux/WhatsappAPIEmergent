"""Bulk campaigns with rate limiting + approval workflow"""
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from server import db
from models import CampaignIn, CampaignApprove, uid, now
from helpers import (
    get_current_user, decrypt_text, audit_log,
    send_whatsapp, update_usage, run_sync,
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
    doc = {
        "id": cid,
        "tenant_id": current["tenant_id"],
        "credential_id": payload.credential_id,
        "name": payload.name,
        "message": payload.message,
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
    """Background task to send campaign messages with rate limiting."""
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

    for phone in recipients_remaining:
        # Check pause status
        cc = await db.campaigns.find_one({"id": cid}, {"_id": 0, "status": 1})
        if cc and cc.get("status") in ("paused", "rejected"):
            break

        result = await run_sync(send_whatsapp, cred, phone, c["message"])
        sent += 1
        if result.get("success"):
            delivered += 1
        else:
            failed += 1

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
                "last_message": c["message"],
                "last_message_at": now().isoformat(),
                "created_at": now().isoformat(),
            }
            await db.conversations.insert_one(conv)
        await db.messages.insert_one({
            "id": uid(),
            "conversation_id": conv["id"],
            "tenant_id": c["tenant_id"],
            "direction": "outbound",
            "content": c["message"],
            "status": "sent" if result.get("success") else "failed",
            "campaign_id": cid,
            "message_id": result.get("sid", ""),
            "sent_at": now().isoformat(),
            "error": None if result.get("success") else result.get("error"),
        })

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
