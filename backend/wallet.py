"""Wallet & per-conversation pricing engine.

Pricing model (defaults; super-admin can override per-tenant):
  - Marketing      ₹0.85 / conversation
  - Utility        ₹0.115 / conversation
  - Authentication ₹0.115 / conversation
  - Service        ₹0.00  / conversation (free customer-initiated within 24h window)

A tenant has billing_mode = 'wallet' | 'byoc':
  - wallet: every outbound conversation deducts wallet_balance_inr at the priced rate.
            If balance < price → send is rejected with 'insufficient_balance'.
  - byoc:   no wallet deduction; tenant pays Meta/Twilio directly.
"""
from datetime import datetime, timezone
from typing import Optional

DEFAULT_PRICING_INR: dict = {
    "marketing": 0.85,
    "utility": 0.115,
    "authentication": 0.115,
    "service": 0.0,
}

VALID_CATEGORIES = set(DEFAULT_PRICING_INR.keys())


def get_price(tenant: dict, category: str = "marketing") -> float:
    """Return the per-conversation price for a tenant + category in INR.

    Raises ValueError on unknown category. Order of precedence:
      1. tenant.pricing_overrides[category]   (super-admin custom rate)
      2. DEFAULT_PRICING_INR[category]
    """
    if category not in VALID_CATEGORIES:
        raise ValueError(f"Unknown pricing category: {category!r}. Allowed: {sorted(VALID_CATEGORIES)}")
    overrides = (tenant or {}).get("pricing_overrides") or {}
    if isinstance(overrides, dict) and category in overrides:
        try:
            return max(0.0, float(overrides[category]))
        except Exception:
            pass
    return DEFAULT_PRICING_INR[category]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def charge_wallet(db, tenant_id: str, category: str = "marketing", note: Optional[str] = None,
                        meta: Optional[dict] = None) -> dict:
    """Atomically check balance & deduct price for one conversation.

    Returns:
      {success: True,  price: float, new_balance: float, txn_id: str}
      {success: False, reason: 'byoc'}                                      # not on wallet plan, no charge
      {success: False, reason: 'tenant_not_found'}
      {success: False, reason: 'insufficient_balance', price, balance}
    """
    from models import uid
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        return {"success": False, "reason": "tenant_not_found"}

    # Free passthrough for BYOC tenants (default for back-compat: assume byoc unless explicitly wallet)
    if (tenant.get("billing_mode") or "byoc") != "wallet":
        return {"success": False, "reason": "byoc"}

    if category not in VALID_CATEGORIES:
        category = "marketing"
    price = get_price(tenant, category)
    if price <= 0:
        # Free service conversation — record but don't deduct
        txn_id = uid()
        await db.wallet_transactions.insert_one({
            "id": txn_id,
            "tenant_id": tenant_id,
            "type": "free",
            "category": category,
            "amount_inr": 0.0,
            "balance_after": float(tenant.get("wallet_balance_inr", 0.0)),
            "note": note or f"{category} (free)",
            "meta": meta or {},
            "created_at": now_iso(),
        })
        return {"success": True, "price": 0.0, "new_balance": float(tenant.get("wallet_balance_inr", 0.0)), "txn_id": txn_id, "category": category}

    balance = float(tenant.get("wallet_balance_inr") or 0.0)
    if balance < price:
        return {"success": False, "reason": "insufficient_balance", "price": price, "balance": balance}

    # Atomic decrement only if balance still sufficient
    res = await db.tenants.find_one_and_update(
        {"id": tenant_id, "wallet_balance_inr": {"$gte": price}},
        {"$inc": {"wallet_balance_inr": -price}},
        return_document=True,
        projection={"_id": 0, "wallet_balance_inr": 1},
    )
    if not res:
        # Race: someone else spent it concurrently
        return {"success": False, "reason": "insufficient_balance", "price": price, "balance": balance}

    new_balance = float(res.get("wallet_balance_inr", 0.0))
    txn_id = uid()
    await db.wallet_transactions.insert_one({
        "id": txn_id,
        "tenant_id": tenant_id,
        "type": "debit",
        "category": category,
        "amount_inr": -price,
        "balance_after": new_balance,
        "note": note or f"WhatsApp {category} conversation",
        "meta": meta or {},
        "created_at": now_iso(),
    })
    return {"success": True, "price": price, "new_balance": new_balance, "txn_id": txn_id, "category": category}


async def credit_wallet(db, tenant_id: str, amount_inr: float, type_: str = "topup",
                        note: Optional[str] = None, meta: Optional[dict] = None) -> dict:
    """Add credit to a tenant's wallet (top-up, refund, manual adjust)."""
    from models import uid
    if amount_inr <= 0:
        return {"success": False, "reason": "amount_must_be_positive"}
    res = await db.tenants.find_one_and_update(
        {"id": tenant_id},
        {"$inc": {"wallet_balance_inr": float(amount_inr)}},
        return_document=True,
        projection={"_id": 0, "wallet_balance_inr": 1},
    )
    if not res:
        return {"success": False, "reason": "tenant_not_found"}
    new_balance = float(res.get("wallet_balance_inr", 0.0))
    txn_id = uid()
    await db.wallet_transactions.insert_one({
        "id": txn_id,
        "tenant_id": tenant_id,
        "type": type_,
        "amount_inr": float(amount_inr),
        "balance_after": new_balance,
        "note": note or "Wallet top-up",
        "meta": meta or {},
        "created_at": now_iso(),
    })
    return {"success": True, "new_balance": new_balance, "txn_id": txn_id}


def estimate_campaign_cost(tenant: dict, recipient_count: int, category: str = "marketing") -> dict:
    if category not in VALID_CATEGORIES:
        category = "marketing"
    price = get_price(tenant, category)
    total = round(price * max(0, recipient_count), 2)
    balance = float(tenant.get("wallet_balance_inr") or 0.0)
    return {
        "price_per_conversation": price,
        "recipient_count": recipient_count,
        "estimated_total_inr": total,
        "wallet_balance_inr": balance,
        "billing_mode": tenant.get("billing_mode") or "byoc",
        "covered": (tenant.get("billing_mode") or "byoc") != "wallet" or balance >= total,
    }
