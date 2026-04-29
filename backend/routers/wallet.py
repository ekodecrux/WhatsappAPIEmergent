"""Tenant wallet — balance, top-up via Razorpay, transaction history."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import db
from models import uid, now
from helpers import get_current_user, audit_log, create_razorpay_order, verify_razorpay_signature
from wallet import (
    credit_wallet,
    DEFAULT_PRICING_INR,
    get_price,
    estimate_campaign_cost,
)


router = APIRouter(prefix="/wallet", tags=["wallet"])


class TopupOrderIn(BaseModel):
    amount_inr: int = Field(ge=100, le=100000)


class WalletVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class BillingModeIn(BaseModel):
    billing_mode: str = Field(pattern="^(wallet|byoc)$")


@router.get("")
async def get_wallet(current=Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0})
    balance = float((tenant or {}).get("wallet_balance_inr") or 0.0)
    mode = (tenant or {}).get("billing_mode") or "byoc"

    # Pricing applicable to this tenant (defaults + overrides)
    pricing = {cat: get_price(tenant, cat) for cat in DEFAULT_PRICING_INR.keys()}

    # Estimated capacity
    marketing_cap = int(balance / pricing["marketing"]) if pricing["marketing"] > 0 else 0
    utility_cap = int(balance / pricing["utility"]) if pricing["utility"] > 0 else 0

    return {
        "billing_mode": mode,
        "wallet_balance_inr": round(balance, 2),
        "pricing_inr": pricing,
        "estimated_marketing_messages_left": marketing_cap,
        "estimated_utility_messages_left": utility_cap,
        "low_balance_threshold_inr": float((tenant or {}).get("low_balance_threshold_inr") or 50.0),
    }


@router.post("/billing-mode")
async def set_billing_mode(payload: BillingModeIn, current=Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Only tenant admins can change billing mode")
    await db.tenants.update_one(
        {"id": current["tenant_id"]},
        {"$set": {"billing_mode": payload.billing_mode, "updated_at": now().isoformat()}},
    )
    await audit_log(current["tenant_id"], current["id"], "set_billing_mode", current["tenant_id"], {"mode": payload.billing_mode})
    return {"billing_mode": payload.billing_mode}


@router.post("/topup/order")
async def topup_create_order(payload: TopupOrderIn, current=Depends(get_current_user)):
    receipt = f"wal-{current['tenant_id'][:8]}-{int(now().timestamp())}"
    res = create_razorpay_order(int(payload.amount_inr), receipt, notes={
        "tenant_id": current["tenant_id"], "purpose": "wallet_topup",
    })
    if not res.get("success"):
        raise HTTPException(500, f"Razorpay error: {res.get('error')}")
    order = res["order"]
    await db.payment_orders.insert_one({
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "user_id": current["id"],
        "purpose": "wallet_topup",
        "amount_inr": int(payload.amount_inr),
        "razorpay_order_id": order["id"],
        "status": "created",
        "created_at": now().isoformat(),
    })
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": res["key_id"],
        "amount_inr": int(payload.amount_inr),
    }


@router.post("/topup/verify")
async def topup_verify(payload: WalletVerifyIn, current=Depends(get_current_user)):
    is_valid = verify_razorpay_signature(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature,
    )
    if not is_valid:
        raise HTTPException(400, "Invalid signature")
    order_doc = await db.payment_orders.find_one(
        {"razorpay_order_id": payload.razorpay_order_id, "tenant_id": current["tenant_id"]}, {"_id": 0},
    )
    if not order_doc:
        raise HTTPException(404, "Order not found")
    if order_doc.get("status") == "paid":
        return {"success": True, "already_credited": True}

    amount = float(order_doc.get("amount_inr") or 0)
    # Apply tenant-level discount as bonus credit
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0, "discount_pct": 1})
    discount_pct = float((tenant or {}).get("discount_pct") or 0)
    bonus = round(amount * discount_pct / 100.0, 2) if discount_pct > 0 else 0.0
    credit_amount = amount + bonus
    res = await credit_wallet(
        db, current["tenant_id"], credit_amount, "topup",
        note=f"Razorpay top-up ₹{amount:.0f}" + (f" + ₹{bonus:.0f} bonus ({discount_pct:.0f}% discount)" if bonus else ""),
        meta={"razorpay_payment_id": payload.razorpay_payment_id, "amount_paid_inr": amount, "bonus_inr": bonus, "discount_pct": discount_pct},
    )
    await db.payment_orders.update_one(
        {"razorpay_order_id": payload.razorpay_order_id},
        {"$set": {
            "status": "paid",
            "razorpay_payment_id": payload.razorpay_payment_id,
            "paid_at": now().isoformat(),
        }},
    )
    await audit_log(current["tenant_id"], current["id"], "wallet_topup", res.get("txn_id", ""), {"amount_inr": amount})
    return {"success": True, "new_balance": res.get("new_balance"), "credited": amount}


@router.get("/transactions")
async def list_transactions(current=Depends(get_current_user), limit: int = 100):
    cur = db.wallet_transactions.find(
        {"tenant_id": current["tenant_id"]}, {"_id": 0},
    ).sort("created_at", -1).limit(min(500, max(1, limit)))
    return await cur.to_list(500)


@router.get("/estimate")
async def estimate(recipients: int = 1, category: str = "marketing", current=Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0})
    return estimate_campaign_cost(tenant or {}, recipients, category)


# ============ Super-admin: pricing overrides + manual credit ============
class PricingOverrideIn(BaseModel):
    marketing: float | None = None
    utility: float | None = None
    authentication: float | None = None
    service: float | None = None


class ManualCreditIn(BaseModel):
    amount_inr: float = Field(gt=-100000, lt=100000)
    note: str | None = None


@router.patch("/admin/{tenant_id}/pricing")
async def set_pricing_override(tenant_id: str, payload: PricingOverrideIn, current=Depends(get_current_user)):
    if not current.get("is_superadmin"):
        raise HTTPException(403, "Super-admin only")
    upd: dict = {}
    body = payload.model_dump(exclude_none=True)
    if not body:
        raise HTTPException(400, "No pricing fields supplied")
    for k, v in body.items():
        upd[f"pricing_overrides.{k}"] = max(0.0, float(v))
    upd["updated_at"] = now().isoformat()
    await db.tenants.update_one({"id": tenant_id}, {"$set": upd})
    await audit_log("platform", current["id"], "admin_pricing_override", tenant_id, body)
    fresh = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "pricing_overrides": 1})
    return {"pricing_overrides": (fresh or {}).get("pricing_overrides", {})}


@router.post("/admin/{tenant_id}/credit")
async def manual_credit(tenant_id: str, payload: ManualCreditIn, current=Depends(get_current_user)):
    """Super-admin can credit (positive) or debit (negative) a tenant's wallet."""
    if not current.get("is_superadmin"):
        raise HTTPException(403, "Super-admin only")
    amount = float(payload.amount_inr)
    if amount == 0:
        raise HTTPException(400, "Amount must be non-zero")
    type_ = "admin_credit" if amount > 0 else "admin_debit"
    if amount > 0:
        res = await credit_wallet(db, tenant_id, amount, type_, note=payload.note or "Manual adjustment by super admin")
    else:
        # negative manual adjust
        from wallet import now_iso
        upd_res = await db.tenants.find_one_and_update(
            {"id": tenant_id, "wallet_balance_inr": {"$gte": abs(amount)}},
            {"$inc": {"wallet_balance_inr": amount}},
            return_document=True,
            projection={"_id": 0, "wallet_balance_inr": 1},
        )
        if not upd_res:
            raise HTTPException(400, "Insufficient balance to debit by that amount")
        new_balance = float(upd_res.get("wallet_balance_inr", 0.0))
        txn_id = uid()
        await db.wallet_transactions.insert_one({
            "id": txn_id, "tenant_id": tenant_id, "type": type_,
            "amount_inr": amount, "balance_after": new_balance,
            "note": payload.note or "Manual debit by super admin",
            "meta": {"by": current["id"]},
            "created_at": now_iso(),
        })
        res = {"success": True, "new_balance": new_balance, "txn_id": txn_id}
    await audit_log("platform", current["id"], type_, tenant_id, {"amount_inr": amount})
    return res


@router.get("/admin/revenue")
async def platform_revenue(current=Depends(get_current_user), days: int = 30):
    """Super-admin: total wallet top-ups (revenue) and message debits (cost-of-goods) for the period."""
    if not current.get("is_superadmin"):
        raise HTTPException(403, "Super-admin only")
    from datetime import timedelta, datetime as _dt, timezone as _tz
    since = (_dt.now(_tz.utc) - timedelta(days=max(1, days))).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount_inr"}, "count": {"$sum": 1}}},
    ]
    rows = await db.wallet_transactions.aggregate(pipeline).to_list(50)
    by_type = {r["_id"]: {"total": round(r["total"], 2), "count": r["count"]} for r in rows}
    topup = by_type.get("topup", {}).get("total", 0)
    debit = abs(by_type.get("debit", {}).get("total", 0))  # absolute since debits are negative
    margin = round(topup - debit, 2)  # revenue - COGS approximation
    return {
        "period_days": days,
        "topups_inr": topup,
        "message_debits_inr": debit,
        "approx_margin_inr": margin,
        "by_type": by_type,
    }
