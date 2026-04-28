"""Super-admin analytics — time-series, top tenants, funnel metrics."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from server import db
from helpers import require_superadmin


router = APIRouter(prefix="/admin/analytics", tags=["admin-analytics"])


def _since_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=max(1, days))).isoformat()


@router.get("/timeseries")
async def timeseries(_=Depends(require_superadmin), days: int = Query(30, ge=1, le=365)):
    """Daily series for last N days: new tenants, messages sent, wallet revenue."""
    since = _since_iso(days)

    # New tenants per day
    t_pipe = [
        {"$match": {"created_at": {"$gte": since}, "is_platform": {"$ne": True}}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
    ]
    new_tenants = {r["_id"]: r["count"] for r in await db.tenants.aggregate(t_pipe).to_list(400)}

    # Outbound messages per day
    m_pipe = [
        {"$match": {"sent_at": {"$gte": since}, "direction": "outbound"}},
        {"$group": {"_id": {"$substr": ["$sent_at", 0, 10]}, "count": {"$sum": 1}}},
    ]
    msgs = {r["_id"]: r["count"] for r in await db.messages.aggregate(m_pipe).to_list(400)}

    # Wallet top-up revenue per day
    rev_pipe = [
        {"$match": {"created_at": {"$gte": since}, "type": "topup"}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "total": {"$sum": "$amount_inr"}}},
    ]
    rev = {r["_id"]: round(r["total"], 2) for r in await db.wallet_transactions.aggregate(rev_pipe).to_list(400)}

    # Wallet debits (cost) per day
    cost_pipe = [
        {"$match": {"created_at": {"$gte": since}, "type": "debit"}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "total": {"$sum": "$amount_inr"}}},
    ]
    cost = {r["_id"]: round(abs(r["total"]), 2) for r in await db.wallet_transactions.aggregate(cost_pipe).to_list(400)}

    # Build evenly-spaced day buckets (oldest -> newest)
    out = []
    today = datetime.now(timezone.utc).date()
    for offset in range(days - 1, -1, -1):
        d = (today - timedelta(days=offset)).isoformat()
        out.append({
            "date": d,
            "new_tenants": new_tenants.get(d, 0),
            "messages": msgs.get(d, 0),
            "revenue_inr": rev.get(d, 0.0),
            "wallet_cost_inr": cost.get(d, 0.0),
        })

    totals = {
        "new_tenants": sum(p["new_tenants"] for p in out),
        "messages": sum(p["messages"] for p in out),
        "revenue_inr": round(sum(p["revenue_inr"] for p in out), 2),
        "wallet_cost_inr": round(sum(p["wallet_cost_inr"] for p in out), 2),
    }
    return {"days": days, "series": out, "totals": totals}


@router.get("/top-tenants")
async def top_tenants(_=Depends(require_superadmin), metric: str = "messages", limit: int = 10):
    """Top tenants by metric: messages | revenue | wallet_balance."""
    if metric == "messages":
        pipe = [
            {"$match": {"direction": "outbound"}},
            {"$group": {"_id": "$tenant_id", "value": {"$sum": 1}}},
            {"$sort": {"value": -1}},
            {"$limit": limit},
        ]
        rows = await db.messages.aggregate(pipe).to_list(limit)
    elif metric == "revenue":
        pipe = [
            {"$match": {"type": "topup"}},
            {"$group": {"_id": "$tenant_id", "value": {"$sum": "$amount_inr"}}},
            {"$sort": {"value": -1}},
            {"$limit": limit},
        ]
        rows = await db.wallet_transactions.aggregate(pipe).to_list(limit)
        for r in rows:
            r["value"] = round(r["value"], 2)
    elif metric == "wallet_balance":
        cur = db.tenants.find(
            {"is_platform": {"$ne": True}, "is_active": True, "wallet_balance_inr": {"$gt": 0}},
            {"_id": 0, "id": 1, "company_name": 1, "wallet_balance_inr": 1},
        ).sort("wallet_balance_inr", -1).limit(limit)
        items = await cur.to_list(limit)
        return [
            {"tenant_id": t["id"], "company_name": t.get("company_name") or "—",
             "value": round(float(t.get("wallet_balance_inr") or 0), 2)} for t in items
        ]
    else:
        return []

    # Hydrate company name for messages/revenue rows
    tids = [r["_id"] for r in rows if r.get("_id")]
    company = {}
    if tids:
        async for t in db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "company_name": 1}):
            company[t["id"]] = t.get("company_name") or "—"
    return [
        {"tenant_id": r["_id"], "company_name": company.get(r["_id"], "—"), "value": r["value"]}
        for r in rows if r.get("_id")
    ]


@router.get("/funnel")
async def funnel(_=Depends(require_superadmin)):
    """Conversion + churn metrics across the platform."""
    not_platform = {"is_platform": {"$ne": True}}
    total = await db.tenants.count_documents(not_platform)
    trial = await db.tenants.count_documents({**not_platform, "plan": "trial"})
    paid = await db.tenants.count_documents({**not_platform, "plan": {"$in": ["basic", "pro", "enterprise"]}})
    suspended = await db.tenants.count_documents({**not_platform, "is_active": False})

    # Active in last 7 days = at least one outbound message in that window
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    active_tids = await db.messages.distinct("tenant_id", {"sent_at": {"$gte": week_ago}, "direction": "outbound"})
    active_7d = len([t for t in active_tids if t])

    # Wallet plan adoption
    wallet_tenants = await db.tenants.count_documents({**not_platform, "billing_mode": "wallet"})

    # Churn proxy: tenants suspended in last 30 days
    month_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    churned_30d = await db.tenants.count_documents({
        **not_platform, "is_active": False, "suspended_at": {"$gte": month_ago},
    })

    convert_rate = round((paid / total) * 100, 1) if total else 0
    activation_rate = round((active_7d / total) * 100, 1) if total else 0
    return {
        "total": total,
        "trial": trial,
        "paid": paid,
        "suspended": suspended,
        "active_7d": active_7d,
        "wallet_plan_tenants": wallet_tenants,
        "churned_30d": churned_30d,
        "trial_to_paid_pct": convert_rate,
        "weekly_activation_pct": activation_rate,
    }


@router.get("/message-mix")
async def message_mix(_=Depends(require_superadmin), days: int = 30):
    """Breakdown of outbound message status (sent / delivered / read / failed)."""
    since = _since_iso(days)
    pipe = [
        {"$match": {"sent_at": {"$gte": since}, "direction": "outbound"}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    rows = await db.messages.aggregate(pipe).to_list(50)
    by_status = {(r["_id"] or "unknown"): r["count"] for r in rows}
    return {"days": days, "by_status": by_status, "total": sum(by_status.values())}
