"""ERP outbound webhook dispatcher.

Delivers signed JSON payloads to a tenant's configured webhooks (db.erp_webhooks)
whenever a message event happens (received, sent, delivered, read, failed).

Each delivery is logged in db.webhook_deliveries so tenants can review history,
re-deliver failed payloads, and monitor latency.
"""
from __future__ import annotations
import asyncio
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

import httpx

from models import uid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def _deliver_one(db, hook: dict, event: str, payload: dict) -> dict:
    """Deliver a single webhook with retry-friendly logging."""
    body = json.dumps({"event": event, "data": payload, "delivered_at": _now_iso()}).encode()
    secret = (hook.get("secret") or "").strip()
    headers = {
        "Content-Type": "application/json",
        "X-Wabridge-Event": event,
        "X-Wabridge-Webhook-Id": hook["id"],
        "User-Agent": "wabridge-webhooks/1.0",
    }
    if secret:
        headers["X-Wabridge-Signature-256"] = _sign(secret, body)

    delivery = {
        "id": uid(),
        "tenant_id": hook["tenant_id"],
        "webhook_id": hook["id"],
        "url": hook["url"],
        "event": event,
        "request_body": body.decode(),
        "status": "pending",
        "status_code": 0,
        "response_body": "",
        "attempted_at": _now_iso(),
        "duration_ms": 0,
    }

    started = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(hook["url"], content=body, headers=headers)
        elapsed = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        delivery["status_code"] = r.status_code
        delivery["response_body"] = r.text[:1000]
        delivery["duration_ms"] = elapsed
        delivery["status"] = "success" if 200 <= r.status_code < 300 else "failed"
    except Exception as e:
        delivery["status"] = "failed"
        delivery["response_body"] = f"network_error: {e}"[:1000]
        delivery["duration_ms"] = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)

    try:
        await db.webhook_deliveries.insert_one(delivery)
        await db.erp_webhooks.update_one(
            {"id": hook["id"]},
            {"$inc": {"delivery_count": 1, ("success_count" if delivery["status"] == "success" else "failure_count"): 1},
             "$set": {"last_delivery_at": delivery["attempted_at"], "last_status": delivery["status"]}},
        )
    except Exception:
        pass

    delivery.pop("_id", None)
    return delivery


async def dispatch_event(db, tenant_id: str, event: str, payload: dict) -> int:
    """Dispatch an event to all matching active webhooks for a tenant.

    Returns the number of webhooks attempted. Runs deliveries in parallel; never raises.
    """
    try:
        cur = db.erp_webhooks.find(
            {"tenant_id": tenant_id, "is_active": True, "events": event}, {"_id": 0},
        )
        hooks = await cur.to_list(50)
    except Exception:
        return 0
    if not hooks:
        return 0
    # Schedule deliveries as tasks so they survive past the request scope
    for h in hooks:
        asyncio.create_task(_deliver_one(db, h, event, payload))
    return len(hooks)


async def deliver_test(db, hook: dict, event: str = "test.ping", payload: dict | None = None) -> dict:
    """Synchronously deliver a test ping; returns delivery record."""
    payload = payload or {"hello": "world", "tenant_id": hook.get("tenant_id")}
    return await _deliver_one(db, hook, event, payload)
