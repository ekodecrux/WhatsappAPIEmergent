"""Dashboard / analytics endpoints"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends

from server import db
from helpers import get_current_user, trial_days_left, PLANS

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
async def overview(current=Depends(get_current_user)):
    tid = current["tenant_id"]
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})

    total_messages = await db.messages.count_documents({"tenant_id": tid})
    sent_messages = await db.messages.count_documents({"tenant_id": tid, "direction": "outbound"})
    inbound_messages = await db.messages.count_documents({"tenant_id": tid, "direction": "inbound"})
    delivered = await db.messages.count_documents({"tenant_id": tid, "status": {"$in": ["delivered", "read", "sent"]}})
    failed = await db.messages.count_documents({"tenant_id": tid, "status": "failed"})

    total_leads = await db.leads.count_documents({"tenant_id": tid})
    qualified_leads = await db.leads.count_documents({"tenant_id": tid, "status": {"$in": ["qualified", "converted"]}})

    total_campaigns = await db.campaigns.count_documents({"tenant_id": tid})
    running_campaigns = await db.campaigns.count_documents({"tenant_id": tid, "status": "running"})

    total_conversations = await db.conversations.count_documents({"tenant_id": tid})
    unread = await db.conversations.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": None, "total": {"$sum": "$unread_count"}}},
    ]).to_list(1)
    unread_total = unread[0]["total"] if unread else 0

    plan_id = tenant.get("plan", "trial")
    plan = PLANS.get(plan_id, {})

    delivery_rate = round((delivered / max(sent_messages, 1)) * 100, 1)

    return {
        "tenant": {
            "company_name": tenant.get("company_name"),
            "plan": plan_id,
            "plan_details": plan,
            "trial_days_left": trial_days_left(tenant),
        },
        "metrics": {
            "messages_sent": sent_messages,
            "messages_inbound": inbound_messages,
            "messages_total": total_messages,
            "delivered": delivered,
            "failed": failed,
            "delivery_rate": delivery_rate,
            "leads_total": total_leads,
            "leads_qualified": qualified_leads,
            "campaigns_total": total_campaigns,
            "campaigns_running": running_campaigns,
            "conversations_total": total_conversations,
            "unread_total": unread_total,
        },
        "limits": {
            "messages": plan.get("messages", 0),
            "leads": plan.get("leads", 0),
            "credentials": plan.get("credentials", 0),
        },
    }


@router.get("/timeseries")
async def timeseries(current=Depends(get_current_user), days: int = 14):
    tid = current["tenant_id"]
    today = datetime.now(timezone.utc).date()
    series = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        d_iso = d.isoformat()
        next_iso = (d + timedelta(days=1)).isoformat()
        sent = await db.messages.count_documents({
            "tenant_id": tid, "direction": "outbound",
            "sent_at": {"$gte": d_iso, "$lt": next_iso},
        })
        inbound = await db.messages.count_documents({
            "tenant_id": tid, "direction": "inbound",
            "sent_at": {"$gte": d_iso, "$lt": next_iso},
        })
        leads = await db.leads.count_documents({
            "tenant_id": tid,
            "created_at": {"$gte": d_iso, "$lt": next_iso},
        })
        series.append({
            "date": d.strftime("%b %d"),
            "sent": sent,
            "received": inbound,
            "leads": leads,
        })
    return series


@router.get("/status-breakdown")
async def status_breakdown(current=Depends(get_current_user)):
    pipeline = [
        {"$match": {"tenant_id": current["tenant_id"], "direction": "outbound"}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    items = await db.messages.aggregate(pipeline).to_list(20)
    return [{"status": i["_id"] or "unknown", "count": i["count"]} for i in items]
