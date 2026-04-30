"""Dashboard / analytics endpoints"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends

from server import db
from helpers import get_current_user, trial_days_left, PLANS, resolve_plan

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

    plan_id = resolve_plan(tenant.get("plan", "free"))
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


@router.get("/summary")
async def unified_summary(current=Depends(get_current_user)):
    """Unified mission-control summary for the Dashboard.

    Returns a single payload with module-level snapshots so the user can see
    everything at a glance and deep-link into each section.
    """
    tid = current["tenant_id"]
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0}) or {}

    # Inbox
    unread_pipe = [
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": None, "total": {"$sum": "$unread_count"},
                    "count": {"$sum": 1}}},
    ]
    inbox_agg = await db.conversations.aggregate(unread_pipe).to_list(1)
    inbox = inbox_agg[0] if inbox_agg else {"total": 0, "count": 0}
    last_inbound = await db.messages.find_one(
        {"tenant_id": tid, "direction": "inbound"}, {"_id": 0},
        sort=[("sent_at", -1)],
    )

    # Campaigns
    running = await db.campaigns.count_documents({"tenant_id": tid, "status": "running"})
    scheduled = await db.campaigns.count_documents({"tenant_id": tid, "status": "scheduled"})
    last_campaign = await db.campaigns.find_one(
        {"tenant_id": tid}, {"_id": 0}, sort=[("created_at", -1)],
    )

    # Leads
    new_leads = await db.leads.count_documents({"tenant_id": tid, "status": "new"})
    qualified = await db.leads.count_documents({"tenant_id": tid, "status": {"$in": ["qualified", "converted"]}})

    # Channels
    channels_count = await db.whatsapp_credentials.count_documents({"tenant_id": tid})
    channels_active = await db.whatsapp_credentials.count_documents({"tenant_id": tid, "status": "active"})

    # Wallet
    wallet_balance = float(tenant.get("wallet_balance_inr") or 0)
    threshold = float(tenant.get("low_balance_threshold_inr") or 50)

    # Flows
    flows_count = await db.flows.count_documents({"tenant_id": tid})
    flows_published = await db.flows.count_documents({"tenant_id": tid, "is_published": True})

    # ERP
    api_keys_active = await db.api_keys.count_documents({"tenant_id": tid, "is_active": True})
    webhooks_active = await db.erp_webhooks.count_documents({"tenant_id": tid, "is_active": True})

    # Cart recovery
    pending_scheduled = await db.scheduled_messages.count_documents({"tenant_id": tid, "status": "pending"})

    # Today's outbound
    today_iso = datetime.now(timezone.utc).date().isoformat()
    today_sent = await db.messages.count_documents({
        "tenant_id": tid, "direction": "outbound", "sent_at": {"$gte": today_iso},
    })

    # Recent failures
    failures_24h = await db.messages.count_documents({
        "tenant_id": tid, "direction": "outbound", "status": "failed",
        "sent_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()},
    })

    # Open tickets
    open_tickets = await db.support_tickets.count_documents({
        "tenant_id": tid, "status": {"$in": ["open", "in_progress", "pending"]},
    })

    # Build attention items (sorted, max 5)
    attention = []
    if channels_count == 0:
        attention.append({"level": "high", "icon": "channel", "msg": "Connect your first WhatsApp number to start sending",
                          "cta": "Connect", "href": "/app/whatsapp"})
    if wallet_balance < threshold and (tenant.get("billing_mode") == "wallet"):
        attention.append({"level": "high", "icon": "wallet", "msg": f"Wallet balance low (₹{wallet_balance:.2f})",
                          "cta": "Top up", "href": "/app/wallet"})
    if inbox.get("total", 0) > 0:
        attention.append({"level": "info", "icon": "inbox", "msg": f"{inbox['total']} unread message{'s' if inbox['total'] != 1 else ''} in your inbox",
                          "cta": "Open inbox", "href": "/app/chat"})
    if failures_24h > 0:
        attention.append({"level": "warn", "icon": "alert", "msg": f"{failures_24h} message{'s' if failures_24h != 1 else ''} failed in last 24 h",
                          "cta": "Review", "href": "/app/delivery"})
    if open_tickets > 0:
        attention.append({"level": "info", "icon": "ticket", "msg": f"{open_tickets} open support ticket{'s' if open_tickets != 1 else ''}",
                          "cta": "View", "href": "/app/support"})
    if flows_count == 0:
        attention.append({"level": "info", "icon": "flow", "msg": "No chatbot yet — clone a template in 1 click",
                          "cta": "Browse Marketplace", "href": "/app/marketplace"})

    return {
        "today_sent": today_sent,
        "attention": attention[:6],
        "modules": {
            "inbox": {
                "unread": inbox.get("total", 0),
                "conversations": inbox.get("count", 0),
                "last_inbound_at": (last_inbound or {}).get("sent_at"),
                "href": "/app/chat",
            },
            "campaigns": {
                "running": running,
                "scheduled": scheduled,
                "last_name": (last_campaign or {}).get("name"),
                "last_status": (last_campaign or {}).get("status"),
                "href": "/app/campaigns",
            },
            "leads": {
                "new": new_leads,
                "qualified": qualified,
                "href": "/app/leads",
            },
            "channels": {
                "total": channels_count,
                "active": channels_active,
                "href": "/app/whatsapp",
            },
            "wallet": {
                "balance_inr": round(wallet_balance, 2),
                "low": wallet_balance < threshold,
                "billing_mode": tenant.get("billing_mode") or "byoc",
                "href": "/app/wallet",
            },
            "flows": {
                "total": flows_count,
                "published": flows_published,
                "href": "/app/flows",
            },
            "erp": {
                "api_keys": api_keys_active,
                "webhooks": webhooks_active,
                "scheduled_pending": pending_scheduled,
                "href": "/app/integrations",
            },
            "support": {
                "open": open_tickets,
                "href": "/app/support",
            },
        },
    }



@router.get("/delivery")
async def delivery_dashboard(current=Depends(get_current_user), days: int = 7, limit: int = 50):
    """Webhook delivery status dashboard.

    Returns: status breakdown, recent failed messages, daily delivery trend, per-campaign breakdown.
    """
    tid = current["tenant_id"]
    today = datetime.now(timezone.utc).date()
    since_iso = (today - timedelta(days=days - 1)).isoformat()

    # 1) Overall status counts (outbound only)
    breakdown = await db.messages.aggregate([
        {"$match": {"tenant_id": tid, "direction": "outbound", "sent_at": {"$gte": since_iso}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(20)
    status_counts = {(b["_id"] or "unknown"): b["count"] for b in breakdown}
    total = sum(status_counts.values())
    delivered = status_counts.get("delivered", 0) + status_counts.get("read", 0)
    delivery_rate = round((delivered / total) * 100, 1) if total else 0
    failure_rate = round(((status_counts.get("failed", 0) + status_counts.get("undelivered", 0)) / total) * 100, 1) if total else 0

    # 2) Recent failed messages
    fail_cur = db.messages.find(
        {
            "tenant_id": tid, "direction": "outbound",
            "status": {"$in": ["failed", "undelivered"]},
        },
        {"_id": 0},
    ).sort("sent_at", -1).limit(limit)
    failed_msgs_raw = await fail_cur.to_list(limit)

    # Hydrate with conversation phone
    conv_ids = list({m.get("conversation_id") for m in failed_msgs_raw if m.get("conversation_id")})
    convos = {}
    if conv_ids:
        async for c in db.conversations.find({"id": {"$in": conv_ids}}, {"_id": 0, "id": 1, "customer_phone": 1, "customer_name": 1}):
            convos[c["id"]] = c
    failed_msgs = []
    for m in failed_msgs_raw:
        c = convos.get(m.get("conversation_id"), {})
        failed_msgs.append({
            "id": m.get("id"),
            "message_id": m.get("message_id"),
            "to_phone": c.get("customer_phone"),
            "to_name": c.get("customer_name"),
            "content": (m.get("content") or "")[:140],
            "status": m.get("status"),
            "error": m.get("error"),
            "sent_at": m.get("sent_at"),
            "campaign_id": m.get("campaign_id"),
        })

    # 3) Daily trend
    trend = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        d_iso = d.isoformat()
        nxt = (d + timedelta(days=1)).isoformat()
        match = {"tenant_id": tid, "direction": "outbound", "sent_at": {"$gte": d_iso, "$lt": nxt}}
        agg = await db.messages.aggregate([
            {"$match": match},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]).to_list(20)
        s = {a["_id"] or "unknown": a["count"] for a in agg}
        trend.append({
            "date": d.strftime("%b %d"),
            "sent": s.get("sent", 0) + s.get("queued", 0) + s.get("accepted", 0),
            "delivered": s.get("delivered", 0) + s.get("read", 0),
            "failed": s.get("failed", 0) + s.get("undelivered", 0),
        })

    # 4) Per-campaign breakdown
    campaign_agg = await db.messages.aggregate([
        {"$match": {"tenant_id": tid, "direction": "outbound", "campaign_id": {"$ne": None}, "sent_at": {"$gte": since_iso}}},
        {"$group": {
            "_id": {"campaign_id": "$campaign_id", "status": "$status"},
            "count": {"$sum": 1},
        }},
    ]).to_list(500)
    by_campaign: dict[str, dict] = {}
    for row in campaign_agg:
        cid = row["_id"].get("campaign_id")
        st = row["_id"].get("status") or "unknown"
        if not cid:
            continue
        e = by_campaign.setdefault(cid, {"sent": 0, "delivered": 0, "failed": 0})
        if st in ("delivered", "read"):
            e["delivered"] += row["count"]
        elif st in ("failed", "undelivered"):
            e["failed"] += row["count"]
        e["sent"] += row["count"]
    campaign_ids = list(by_campaign.keys())
    campaign_names = {}
    if campaign_ids:
        async for c in db.campaigns.find({"id": {"$in": campaign_ids}}, {"_id": 0, "id": 1, "name": 1}):
            campaign_names[c["id"]] = c.get("name")
    campaigns_out = []
    for cid, e in by_campaign.items():
        rate = round((e["delivered"] / e["sent"]) * 100, 1) if e["sent"] else 0
        campaigns_out.append({
            "campaign_id": cid,
            "campaign_name": campaign_names.get(cid) or "Untitled",
            "sent": e["sent"],
            "delivered": e["delivered"],
            "failed": e["failed"],
            "delivery_rate": rate,
        })
    campaigns_out.sort(key=lambda x: x["sent"], reverse=True)

    return {
        "totals": {
            "total": total,
            "delivered": delivered,
            "failed": status_counts.get("failed", 0) + status_counts.get("undelivered", 0),
            "pending": status_counts.get("queued", 0) + status_counts.get("accepted", 0) + status_counts.get("sent", 0),
            "delivery_rate": delivery_rate,
            "failure_rate": failure_rate,
        },
        "status_counts": status_counts,
        "trend": trend,
        "recent_failed": failed_msgs,
        "by_campaign": campaigns_out[:20],
    }
