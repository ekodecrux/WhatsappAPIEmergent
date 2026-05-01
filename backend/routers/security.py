"""Security & compliance endpoints: audit log viewer + inactive-user cleanup controls.

Visible to Owner/Admin (via RBAC `audit_log.view`) + super-admin cross-tenant viewer.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query

from server import db
from helpers import get_current_user
from rbac import require_permission

router = APIRouter(prefix="/security", tags=["security"])


@router.get("/audit-logs")
async def audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    method: str | None = None,
    endpoint_contains: str | None = None,
    user_id: str | None = None,
    current=Depends(require_permission("audit_log.view")),
):
    """List audit logs for the caller's tenant. Super-admins may pass `tenant_id` to cross-scope."""
    q: dict = {"tenant_id": current["tenant_id"]}
    if current.get("is_superadmin"):
        q = {}  # cross-tenant view
    if method:
        q["method"] = method.upper()
    if endpoint_contains:
        q["endpoint"] = {"$regex": endpoint_contains, "$options": "i"}
    if user_id:
        q["user_id"] = user_id
    cur = db.audit_logs.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cur.to_list(limit)


@router.get("/audit-summary")
async def audit_summary(days: int = Query(default=7, ge=1, le=90), current=Depends(require_permission("audit_log.view"))):
    """Aggregate counts by (method, user_id) for the past N days — for the Security tab."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    match: dict = {"created_at_dt": {"$gte": since}}
    if not current.get("is_superadmin"):
        match["tenant_id"] = current["tenant_id"]
    pipe = [
        {"$match": match},
        {"$group": {
            "_id": {"method": "$method", "user_id": "$user_id"},
            "count": {"$sum": 1},
            "last_at": {"$max": "$created_at"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": 200},
    ]
    rows = await db.audit_logs.aggregate(pipe).to_list(200)
    return [
        {"method": r["_id"]["method"], "user_id": r["_id"].get("user_id"), "count": r["count"], "last_at": r.get("last_at")}
        for r in rows
    ]


# ---------- Inactive users oversight ----------
@router.get("/inactive-users")
async def inactive_users(current=Depends(require_permission("users.view"))):
    """Users at risk of 90-day auto-revoke. Warnings emitted at 60 / 75 / 89 days."""
    now = datetime.now(timezone.utc)
    tenant_filter = {"tenant_id": current["tenant_id"]} if not current.get("is_superadmin") else {}
    users = await db.users.find(tenant_filter, {"_id": 0, "password_hash": 0, "mfa_secret": 0, "mfa_secret_pending": 0}).to_list(1000)
    rows = []
    for u in users:
        ll = u.get("last_login") or u.get("created_at")
        try:
            ll_dt = datetime.fromisoformat(ll.replace("Z", "+00:00")) if ll else now
        except Exception:
            ll_dt = now
        days_idle = (now - ll_dt).days
        rows.append({
            "id": u["id"],
            "email": u["email"],
            "full_name": u.get("full_name", ""),
            "role": u.get("role", "viewer"),
            "is_active": u.get("is_active", True),
            "last_login": ll,
            "days_idle": days_idle,
            "expires_in_days": max(0, 90 - days_idle) if u.get("is_active", True) else 0,
            "mfa_enabled": bool(u.get("mfa_enabled")),
        })
    rows.sort(key=lambda r: -r["days_idle"])
    return rows
