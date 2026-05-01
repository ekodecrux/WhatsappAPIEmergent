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
    """Run forever; poll scheduled_messages and dispatch due ones. Also runs hourly security jobs."""
    logger.info("Scheduler started (interval=%ss)", interval_s)
    last_security_run = 0.0
    while True:
        try:
            n = await _process_due(db)
            if n:
                logger.info("Scheduler delivered %d due messages", n)
        except Exception as e:
            logger.exception("scheduler loop error: %s", e)

        # Run compliance jobs hourly
        import time as _t
        if _t.time() - last_security_run > 3600:
            try:
                await _run_security_jobs(db)
            except Exception as e:
                logger.exception("security jobs error: %s", e)
            last_security_run = _t.time()

        await asyncio.sleep(interval_s)


async def _run_security_jobs(db):
    """SOC-F1 + SOC-F6: auto-revoke inactive users + hard-purge deleted tenants after retention window."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    # --- (A) Inactive-user auto-revoke (>90 days idle) ---
    cutoff_90 = (now - timedelta(days=90)).isoformat()
    revoked = await db.users.update_many(
        {
            "is_active": {"$ne": False},
            "is_superadmin": {"$ne": True},
            "last_login": {"$lt": cutoff_90},
        },
        {"$set": {"is_active": False, "deactivated_at": now.isoformat(), "deactivation_reason": "90-day inactivity (SOC-F1)"}},
    )
    if revoked.modified_count:
        logger.info("SOC-F1: auto-revoked %d inactive users (>90d)", revoked.modified_count)

    # --- (B) Warning emails at 60/75/89 days (best-effort) ---
    try:
        from helpers import send_email
        for days, label in [(60, "60-day"), (75, "15-day"), (89, "tomorrow")]:
            low = (now - timedelta(days=days + 1)).isoformat()
            high = (now - timedelta(days=days)).isoformat()
            warn_filter = {
                "is_active": True,
                "is_superadmin": {"$ne": True},
                "last_login": {"$gte": low, "$lt": high},
                f"warned_{days}d": {"$ne": True},
            }
            to_warn = await db.users.find(warn_filter, {"_id": 0, "email": 1, "full_name": 1, "id": 1}).to_list(500)
            for u in to_warn:
                try:
                    send_email(
                        u["email"],
                        f"Your wabridge account will be disabled {label}",
                        f"<p>Hi {u.get('full_name','')}, your account has been idle for {days} days. "
                        f"To keep it active, simply <a href='https://wabridge.com/login'>sign in</a>. "
                        f"Accounts idle for 90 days are auto-disabled per our SOC-F1 security policy.</p>",
                    )
                except Exception:
                    pass
                await db.users.update_one({"id": u["id"]}, {"$set": {f"warned_{days}d": True, f"warned_{days}d_at": now.isoformat()}})
    except Exception:
        pass

    # --- (C) Data retention hard-purge (SOC-F6) ---
    # Tenants with deleted_at > retention_days ago → hard purge
    tenants_to_purge = await db.tenants.find(
        {"deleted_at": {"$exists": True}},
        {"_id": 0, "id": 1, "deleted_at": 1, "retention_days": 1},
    ).to_list(500)
    for t in tenants_to_purge:
        try:
            retention = int(t.get("retention_days") or 90)
            deleted_at = datetime.fromisoformat(str(t["deleted_at"]).replace("Z", "+00:00"))
            if (now - deleted_at).days < retention:
                continue
            tid = t["id"]
            # Purge tenant-scoped collections
            purged_counts = {}
            for col_name in ("users", "conversations", "messages", "leads", "campaigns", "flows",
                             "flow_sessions", "templates", "whatsapp_credentials", "quick_replies",
                             "wallets", "wallet_transactions", "support_tickets", "scheduled_messages",
                             "products", "checkouts", "api_keys", "erp_webhooks", "tenant_domains",
                             "audit_logs", "webhook_deliveries", "auto_reply_rules"):
                col = db[col_name]
                r = await col.delete_many({"tenant_id": tid})
                if r.deleted_count:
                    purged_counts[col_name] = r.deleted_count
            await db.tenants.delete_one({"id": tid})
            logger.info("SOC-F6: purged tenant %s → %s", tid, purged_counts)
        except Exception as e:
            logger.exception("purge failed for tenant %s: %s", t.get("id"), e)
