"""Background scheduler — runs scheduled_messages (cart recovery + delayed follow-ups).

Polls every 30 s. Each scheduled doc has:
  {tenant_id, credential_id, to_phone, body, send_at, status, category, ...}

When send_at <= now & status == 'pending', attempts a billed send via send_whatsapp_billed.
On success, status='sent'; on failure, status='failed' with error stored.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger("wa-scheduler")


async def _process_due(db) -> int:
    from helpers import send_whatsapp_billed
    from models import uid, now
    from erp_dispatcher import dispatch_event

    nowiso = datetime.now(timezone.utc).isoformat()
    cur = db.scheduled_messages.find(
        {"status": "pending", "send_at": {"$lte": nowiso}}, {"_id": 0},
    ).limit(50)
    rows = await cur.to_list(50)
    if not rows:
        return 0

    processed = 0
    for row in rows:
        # Atomic claim — only one worker should pick this up
        claim = await db.scheduled_messages.find_one_and_update(
            {"id": row["id"], "status": "pending"},
            {"$set": {"status": "processing", "claimed_at": nowiso}},
            return_document=True,
            projection={"_id": 0},
        )
        if not claim:
            continue
        try:
            cred = await db.whatsapp_credentials.find_one(
                {"id": claim.get("credential_id"), "tenant_id": claim["tenant_id"]}, {"_id": 0},
            )
            if not cred:
                cred = await db.whatsapp_credentials.find_one({"tenant_id": claim["tenant_id"]}, {"_id": 0})
            if not cred:
                await db.scheduled_messages.update_one(
                    {"id": claim["id"]},
                    {"$set": {"status": "failed", "error": "no_credential", "completed_at": nowiso}},
                )
                continue

            res = await send_whatsapp_billed(
                db, claim["tenant_id"], cred, claim["to_phone"], claim.get("body") or "",
                media_url=claim.get("media_url"), media_type=claim.get("media_type"),
                category=claim.get("category", "marketing"),
                note=claim.get("note") or "Scheduled message",
            )

            # Persist into chat history
            conv = await db.conversations.find_one(
                {"tenant_id": claim["tenant_id"], "customer_phone": claim["to_phone"]}, {"_id": 0},
            )
            if not conv:
                conv = {
                    "id": uid(),
                    "tenant_id": claim["tenant_id"],
                    "credential_id": cred["id"],
                    "customer_phone": claim["to_phone"],
                    "customer_name": claim["to_phone"],
                    "status": "active",
                    "unread_count": 0,
                    "lead_score": 50,
                    "last_message": claim.get("body", ""),
                    "last_message_at": now().isoformat(),
                    "created_at": now().isoformat(),
                }
                await db.conversations.insert_one(conv)

            await db.messages.insert_one({
                "id": uid(),
                "conversation_id": conv["id"],
                "tenant_id": claim["tenant_id"],
                "direction": "outbound",
                "content": claim.get("body", ""),
                "media_url": claim.get("media_url"),
                "media_type": claim.get("media_type"),
                "status": res.get("status", "sent") if res.get("success") else "failed",
                "message_id": res.get("sid", ""),
                "source": claim.get("source", "scheduler"),
                "sent_at": now().isoformat(),
                "error": None if res.get("success") else res.get("error"),
            })

            await db.scheduled_messages.update_one(
                {"id": claim["id"]},
                {"$set": {"status": "sent" if res.get("success") else "failed",
                          "completed_at": nowiso,
                          "result": {"sid": res.get("sid"), "error": res.get("error")},
                          "billing": res.get("billing")}},
            )
            try:
                await dispatch_event(
                    db, claim["tenant_id"],
                    "message.sent" if res.get("success") else "message.failed",
                    {"id": claim["id"], "to_phone": claim["to_phone"],
                     "content": claim.get("body", ""), "scheduled": True,
                     "kind": claim.get("kind", "scheduled")},
                )
            except Exception:
                pass
            processed += 1
        except Exception as e:
            logger.exception("scheduler row failed: %s", e)
            await db.scheduled_messages.update_one(
                {"id": claim.get("id")},
                {"$set": {"status": "failed", "error": str(e)[:300], "completed_at": nowiso}},
            )
    return processed


async def scheduler_loop(db, interval_s: int = 30):
    """Run forever; poll scheduled_messages and dispatch due ones."""
    logger.info("Scheduler started (interval=%ss)", interval_s)
    while True:
        try:
            n = await _process_due(db)
            if n:
                logger.info("Scheduler delivered %d due messages", n)
        except Exception as e:
            logger.exception("scheduler loop error: %s", e)
        await asyncio.sleep(interval_s)
