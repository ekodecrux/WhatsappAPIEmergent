"""Subscription, billing, Razorpay"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import CheckoutOrderIn, VerifyPaymentIn, uid, now
from helpers import (
    get_current_user, audit_log, PLANS, PLAN_ALIASES, resolve_plan, trial_days_left,
    create_razorpay_order, verify_razorpay_signature,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans")
async def list_plans():
    out = []
    for k, v in PLANS.items():
        out.append({"id": k, **v})
    return out


@router.get("/subscription")
async def my_subscription(current=Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0})
    resolved = resolve_plan(tenant.get("plan", "free"))
    plan = PLANS.get(resolved, {})
    return {
        "plan": resolved,
        "plan_details": plan,
        "trial_days_left": trial_days_left(tenant),
        "subscription_end": tenant.get("subscription_end_date"),
    }


@router.post("/orders")
async def create_order(payload: CheckoutOrderIn, current=Depends(get_current_user)):
    target = resolve_plan(payload.plan)
    if target not in PLANS or target == "free":
        raise HTTPException(400, "Invalid plan — use 'starter' or 'pro'")
    plan = PLANS[target]
    receipt = f"{current['tenant_id'][:8]}-{int(now().timestamp())}"
    res = create_razorpay_order(plan["price_inr"], receipt, notes={
        "tenant_id": current["tenant_id"], "plan": target,
    })
    if not res.get("success"):
        raise HTTPException(500, f"Razorpay error: {res.get('error')}")
    order = res["order"]
    await db.payment_orders.insert_one({
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "user_id": current["id"],
        "plan": target,
        "amount_inr": plan["price_inr"],
        "razorpay_order_id": order["id"],
        "status": "created",
        "created_at": now().isoformat(),
    })
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": res["key_id"],
        "plan": target,
    }


@router.post("/verify")
async def verify_payment(payload: VerifyPaymentIn, current=Depends(get_current_user)):
    is_valid = verify_razorpay_signature(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
    )
    if not is_valid:
        raise HTTPException(400, "Invalid signature")
    target = resolve_plan(payload.plan)
    plan = PLANS.get(target)
    if not plan:
        raise HTTPException(400, "Invalid plan")

    end_at = now() + timedelta(days=plan["duration_days"])
    await db.tenants.update_one(
        {"id": current["tenant_id"]},
        {"$set": {
            "plan": target,
            "subscription_end_date": end_at.isoformat(),
            "updated_at": now().isoformat(),
        }},
    )
    await db.payment_orders.update_one(
        {"razorpay_order_id": payload.razorpay_order_id},
        {"$set": {
            "status": "paid",
            "razorpay_payment_id": payload.razorpay_payment_id,
            "paid_at": now().isoformat(),
        }},
    )
    await audit_log(current["tenant_id"], current["id"], "subscription_upgrade", target)
    return {"success": True, "plan": target, "ends_at": end_at.isoformat()}


@router.get("/orders")
async def list_orders(current=Depends(get_current_user)):
    cur = db.payment_orders.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(100)
