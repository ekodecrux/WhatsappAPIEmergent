"""Subscription, billing, Razorpay"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import CheckoutOrderIn, VerifyPaymentIn, uid, now
from helpers import (
    get_current_user, audit_log, PLANS, trial_days_left,
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
    plan = PLANS.get(tenant.get("plan", "trial"), {})
    return {
        "plan": tenant.get("plan", "trial"),
        "plan_details": plan,
        "trial_days_left": trial_days_left(tenant),
        "subscription_end": tenant.get("subscription_end_date"),
    }


@router.post("/orders")
async def create_order(payload: CheckoutOrderIn, current=Depends(get_current_user)):
    if payload.plan not in PLANS or payload.plan == "trial":
        raise HTTPException(400, "Invalid plan")
    plan = PLANS[payload.plan]
    receipt = f"{current['tenant_id'][:8]}-{int(now().timestamp())}"
    res = create_razorpay_order(plan["price_inr"], receipt, notes={
        "tenant_id": current["tenant_id"], "plan": payload.plan,
    })
    if not res.get("success"):
        raise HTTPException(500, f"Razorpay error: {res.get('error')}")
    order = res["order"]
    await db.payment_orders.insert_one({
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "user_id": current["id"],
        "plan": payload.plan,
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
        "plan": payload.plan,
    }


@router.post("/verify")
async def verify_payment(payload: VerifyPaymentIn, current=Depends(get_current_user)):
    is_valid = verify_razorpay_signature(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
    )
    if not is_valid:
        raise HTTPException(400, "Invalid signature")
    plan = PLANS.get(payload.plan)
    if not plan:
        raise HTTPException(400, "Invalid plan")

    end_at = now() + timedelta(days=plan["duration_days"])
    await db.tenants.update_one(
        {"id": current["tenant_id"]},
        {"$set": {
            "plan": payload.plan,
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
    await audit_log(current["tenant_id"], current["id"], "subscription_upgrade", payload.plan)
    return {"success": True, "plan": payload.plan, "ends_at": end_at.isoformat()}


@router.get("/orders")
async def list_orders(current=Depends(get_current_user)):
    cur = db.payment_orders.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(100)
