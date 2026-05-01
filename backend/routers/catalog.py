"""WhatsApp Catalog + Razorpay checkout link generator.

Lets tenants:
  - Create products (CRUD) — stored in db.products
  - Generate a per-customer Razorpay payment link from a product → returned as wa.me-pasteable URL
  - Reference product_id in flow nodes (`catalog`, `checkout`) for in-bot commerce
"""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import db
from models import uid, now
from helpers import get_current_user, audit_log, create_razorpay_order

router = APIRouter(prefix="/catalog", tags=["catalog"])


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    price_inr: float = Field(ge=1)
    currency: str = "INR"
    image_url: str | None = None
    sku: str | None = None
    in_stock: bool = True
    category: str | None = None


@router.get("/products")
async def list_products(current=Depends(get_current_user)):
    cur = db.products.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@router.post("/products")
async def create_product(payload: ProductIn, current=Depends(get_current_user)):
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        **payload.model_dump(),
        "created_by": current["id"],
        "created_at": now().isoformat(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    await audit_log(current["tenant_id"], current["id"], "create_product", doc["id"], {"name": payload.name})
    return doc


@router.patch("/products/{pid}")
async def update_product(pid: str, payload: ProductIn, current=Depends(get_current_user)):
    res = await db.products.update_one(
        {"id": pid, "tenant_id": current["tenant_id"]},
        {"$set": {**payload.model_dump(), "updated_at": now().isoformat()}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Product not found")
    return await db.products.find_one({"id": pid}, {"_id": 0})


@router.delete("/products/{pid}")
async def delete_product(pid: str, current=Depends(get_current_user)):
    res = await db.products.delete_one({"id": pid, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


class CheckoutIn(BaseModel):
    product_id: str
    customer_phone: str
    customer_name: str | None = None


@router.post("/checkout")
async def create_checkout(payload: CheckoutIn, current=Depends(get_current_user)):
    """Generate a Razorpay order + return a wa.me-pasteable payment URL."""
    p = await db.products.find_one({"id": payload.product_id, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    receipt = f"chk_{uid()[:10]}"
    res = create_razorpay_order(
        float(p["price_inr"]), receipt,
        notes={"tenant_id": current["tenant_id"], "product_id": p["id"], "customer_phone": payload.customer_phone},
    )
    if not res.get("success"):
        raise HTTPException(500, f"Razorpay error: {res.get('error')}")

    order = res["order"]
    co = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "product_id": p["id"],
        "product_name": p["name"],
        "amount_inr": float(p["price_inr"]),
        "customer_phone": payload.customer_phone,
        "customer_name": payload.customer_name,
        "razorpay_order_id": order["id"],
        "status": "pending",
        "created_at": now().isoformat(),
    }
    await db.checkouts.insert_one(co)
    co.pop("_id", None)

    # Public hosted-checkout URL (frontend route /pay/{checkout_id})
    base = "https://messaging-vault.preview.emergentagent.com"
    pay_url = f"{base}/pay/{co['id']}"

    return {
        "checkout_id": co["id"],
        "razorpay_order_id": order["id"],
        "amount_inr": co["amount_inr"],
        "key_id": res["key_id"],
        "pay_url": pay_url,
        "wa_message_template": (
            f"Hi {payload.customer_name or 'there'}! Complete your order for "
            f"{p['name']} (₹{p['price_inr']:.0f}) here: {pay_url}"
        ),
    }


@router.get("/checkouts")
async def list_checkouts(current=Depends(get_current_user), status: str | None = None, limit: int = 100):
    q = {"tenant_id": current["tenant_id"]}
    if status:
        q["status"] = status
    cur = db.checkouts.find(q, {"_id": 0}).sort("created_at", -1).limit(min(500, max(1, limit)))
    return await cur.to_list(500)
