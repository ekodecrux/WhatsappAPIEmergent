"""Super-admin platform-wide endpoints. Requires user.is_superadmin == True."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import TenantUpdateIn, uid, now
from helpers import require_superadmin, audit_log, PLANS, trial_days_left


router = APIRouter(prefix="/admin", tags=["admin"])


# ============ Platform stats ============
@router.get("/stats")
async def platform_stats(_=Depends(require_superadmin)):
    """High-level metrics across the entire platform."""
    total_tenants = await db.tenants.count_documents({"is_platform": {"$ne": True}})
    active_tenants = await db.tenants.count_documents({"is_active": True, "is_platform": {"$ne": True}})
    suspended = await db.tenants.count_documents({"is_active": False, "is_platform": {"$ne": True}})
    total_users = await db.users.count_documents({})
    total_messages = await db.messages.count_documents({})
    total_campaigns = await db.campaigns.count_documents({})
    total_flows = await db.flows.count_documents({})
    total_marketplace = await db.marketplace_templates.count_documents({})

    # Plan distribution
    plan_pipeline = [
        {"$match": {"is_platform": {"$ne": True}}},
        {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
    ]
    plan_dist = await db.tenants.aggregate(plan_pipeline).to_list(20)
    plan_distribution = {p["_id"] or "unknown": p["count"] for p in plan_dist}

    # MRR (monthly recurring revenue, INR)
    mrr = 0
    for plan_id, count in plan_distribution.items():
        plan = PLANS.get(plan_id, {})
        if plan.get("price_inr"):
            mrr += plan["price_inr"] * count

    # Tickets summary
    open_tickets = await db.support_tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    urgent_tickets = await db.support_tickets.count_documents({"priority": "urgent", "status": {"$ne": "closed"}})

    # Trial expiring soon (next 3 days)
    soon = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    trial_expiring = await db.tenants.count_documents({
        "plan": "trial", "is_active": True, "is_platform": {"$ne": True},
        "trial_end_date": {"$lt": soon},
    })

    # New tenants in last 7 days
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    new_tenants_7d = await db.tenants.count_documents({
        "created_at": {"$gte": week_ago}, "is_platform": {"$ne": True},
    })

    return {
        "tenants": {
            "total": total_tenants,
            "active": active_tenants,
            "suspended": suspended,
            "new_7d": new_tenants_7d,
            "trial_expiring_3d": trial_expiring,
        },
        "users": total_users,
        "messages": total_messages,
        "campaigns": total_campaigns,
        "flows": total_flows,
        "marketplace_templates": total_marketplace,
        "plan_distribution": plan_distribution,
        "mrr_inr": mrr,
        "tickets": {"open": open_tickets, "urgent": urgent_tickets},
    }


# ============ Tenants ============
@router.get("/tenants")
async def list_tenants(
    _=Depends(require_superadmin),
    search: str | None = None,
    plan: str | None = None,
    active: str | None = None,  # "true" | "false"
):
    q: dict = {"is_platform": {"$ne": True}}
    if plan and plan != "all":
        q["plan"] = plan
    if active in ("true", "false"):
        q["is_active"] = (active == "true")
    if search:
        q["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"id": search},
        ]
    tenants = await db.tenants.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Hydrate with user count + message count + last_login
    out = []
    for t in tenants:
        tid = t["id"]
        users_count = await db.users.count_documents({"tenant_id": tid})
        messages_count = await db.messages.count_documents({"tenant_id": tid, "direction": "outbound"})
        last_user = await db.users.find_one({"tenant_id": tid}, {"_id": 0, "last_login": 1, "email": 1}, sort=[("last_login", -1)])
        out.append({
            **t,
            "users_count": users_count,
            "messages_sent": messages_count,
            "trial_days_left": trial_days_left(t),
            "last_login": (last_user or {}).get("last_login"),
            "primary_email": (last_user or {}).get("email"),
            "wallet_balance_inr": float(t.get("wallet_balance_inr") or 0.0),
            "billing_mode": t.get("billing_mode") or "byoc",
        })
    return out


@router.get("/tenants/{tid}")
async def get_tenant_details(tid: str, _=Depends(require_superadmin)):
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    users = await db.users.find({"tenant_id": tid}, {"_id": 0, "password_hash": 0}).to_list(100)
    creds = await db.whatsapp_credentials.find({"tenant_id": tid}, {"_id": 0, "account_sid_enc": 0, "auth_token_enc": 0, "access_token_enc": 0}).to_list(20)
    campaigns = await db.campaigns.count_documents({"tenant_id": tid})
    flows = await db.flows.count_documents({"tenant_id": tid})
    leads = await db.leads.count_documents({"tenant_id": tid})
    convs = await db.conversations.count_documents({"tenant_id": tid})
    msgs = await db.messages.count_documents({"tenant_id": tid})
    tickets = await db.support_tickets.count_documents({"tenant_id": tid})
    return {
        "tenant": {**t, "trial_days_left": trial_days_left(t)},
        "users": users,
        "credentials": creds,
        "stats": {
            "campaigns": campaigns,
            "flows": flows,
            "leads": leads,
            "conversations": convs,
            "messages": msgs,
            "tickets": tickets,
        },
    }


@router.patch("/tenants/{tid}")
async def update_tenant(tid: str, payload: TenantUpdateIn, current=Depends(require_superadmin)):
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t.get("is_platform"):
        raise HTTPException(400, "Cannot modify platform tenant")

    upd: dict = {}
    if payload.plan is not None:
        if payload.plan not in PLANS:
            raise HTTPException(400, f"Invalid plan. Allowed: {list(PLANS.keys())}")
        upd["plan"] = payload.plan
        if payload.plan != "trial":
            # Set subscription dates
            upd["subscription_start_date"] = now().isoformat()
            upd["subscription_end_date"] = (now() + timedelta(days=PLANS[payload.plan].get("duration_days", 30))).isoformat()
    if payload.is_active is not None:
        upd["is_active"] = payload.is_active
        if not payload.is_active:
            upd["suspended_at"] = now().isoformat()
            upd["suspended_by"] = current["id"]
    if payload.extend_trial_days:
        if payload.extend_trial_days < 1 or payload.extend_trial_days > 90:
            raise HTTPException(400, "extend_trial_days must be between 1 and 90")
        if t.get("plan") != "trial" and not (payload.plan == "trial"):
            raise HTTPException(400, "extend_trial_days only applies to trial plans")
        # parse current trial_end_date
        cur_end = t.get("trial_end_date")
        try:
            cur_dt = datetime.fromisoformat(cur_end) if cur_end else now()
            if cur_dt.tzinfo is None:
                cur_dt = cur_dt.replace(tzinfo=timezone.utc)
        except Exception:
            cur_dt = now()
        new_end = max(cur_dt, now()) + timedelta(days=payload.extend_trial_days)
        upd["trial_end_date"] = new_end.isoformat()
    if payload.notes is not None:
        upd["admin_notes"] = payload.notes
    if payload.discount_pct is not None:
        if payload.discount_pct < 0 or payload.discount_pct > 100:
            raise HTTPException(400, "discount_pct must be between 0 and 100")
        upd["discount_pct"] = float(payload.discount_pct)
    if payload.billing_mode is not None:
        if payload.billing_mode not in ("wallet", "byoc"):
            raise HTTPException(400, "billing_mode must be 'wallet' or 'byoc'")
        upd["billing_mode"] = payload.billing_mode
    upd["updated_at"] = now().isoformat()

    await db.tenants.update_one({"id": tid}, {"$set": upd})
    await audit_log("platform", current["id"], "admin_update_tenant", tid, {k: v for k, v in upd.items() if k != "updated_at"})

    fresh = await db.tenants.find_one({"id": tid}, {"_id": 0})
    return {**fresh, "trial_days_left": trial_days_left(fresh)}


# ============ Impersonation ============
@router.post("/tenants/{tid}/impersonate")
async def impersonate_tenant(tid: str, current=Depends(require_superadmin)):
    """Issue a short-lived tenant-scoped JWT so the platform owner can 'View as tenant X'.

    The returned token impersonates the *first admin* of the tenant. The original superadmin
    session in the browser must be preserved client-side and restored on exit.
    """
    from helpers import create_token
    t = await db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    if t.get("is_platform"):
        raise HTTPException(400, "Cannot impersonate platform tenant")
    target = await db.users.find_one(
        {"tenant_id": tid, "role": "admin"}, {"_id": 0, "password_hash": 0},
        sort=[("created_at", 1)],
    )
    if not target:
        target = await db.users.find_one(
            {"tenant_id": tid}, {"_id": 0, "password_hash": 0},
            sort=[("created_at", 1)],
        )
    if not target:
        raise HTTPException(400, "Tenant has no users to impersonate")

    token = create_token(target["id"], tid)
    await audit_log("platform", current["id"], "impersonate_tenant", tid,
                    {"as_user": target.get("email")})
    return {
        "access_token": token,
        "user_id": target["id"],
        "tenant_id": tid,
        "email": target.get("email"),
        "full_name": target.get("full_name") or target.get("email"),
        "role": target.get("role", "admin"),
        "company_name": t.get("company_name"),
        "plan": t.get("plan", "trial"),
        "trial_days_left": trial_days_left(t),
        "is_superadmin": False,
        "impersonating": True,
        "impersonated_by": current.get("email"),
    }



# ============ Users (cross-tenant) ============
@router.get("/users")
async def list_users(_=Depends(require_superadmin), search: str | None = None):
    q: dict = {}
    if search:
        q["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"full_name": {"$regex": search, "$options": "i"}},
        ]
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(500).to_list(500)
    # Add company_name
    tenant_ids = list({u.get("tenant_id") for u in users if u.get("tenant_id")})
    tenants = {}
    if tenant_ids:
        async for t in db.tenants.find({"id": {"$in": tenant_ids}}, {"_id": 0, "id": 1, "company_name": 1}):
            tenants[t["id"]] = t.get("company_name")
    for u in users:
        u["company_name"] = tenants.get(u.get("tenant_id"), "—")
    return users


# ============ Subscriptions / Orders ============
@router.get("/subscriptions")
async def list_subscriptions(_=Depends(require_superadmin)):
    """Return all paid orders across tenants from db.orders."""
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    # Hydrate company_name
    tids = list({o.get("tenant_id") for o in orders if o.get("tenant_id")})
    company = {}
    if tids:
        async for t in db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "company_name": 1}):
            company[t["id"]] = t.get("company_name")
    for o in orders:
        o["company_name"] = company.get(o.get("tenant_id"), "—")
    return orders


# ============ Tickets (super-admin view of all) ============
@router.get("/tickets")
async def list_all_tickets(_=Depends(require_superadmin), status: str | None = None, priority: str | None = None):
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    if priority and priority != "all":
        q["priority"] = priority
    tickets = await db.support_tickets.find(q, {"_id": 0}).sort([("priority", -1), ("created_at", -1)]).limit(500).to_list(500)
    # Hydrate company name + user email
    tids = list({t.get("tenant_id") for t in tickets if t.get("tenant_id")})
    uids = list({t.get("user_id") for t in tickets if t.get("user_id")})
    company = {}
    user_email = {}
    if tids:
        async for t in db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "company_name": 1}):
            company[t["id"]] = t.get("company_name")
    if uids:
        async for u in db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "email": 1, "full_name": 1}):
            user_email[u["id"]] = {"email": u.get("email"), "full_name": u.get("full_name")}
    for t in tickets:
        t["company_name"] = company.get(t.get("tenant_id"), "—")
        t["user"] = user_email.get(t.get("user_id"), {})
    return tickets
