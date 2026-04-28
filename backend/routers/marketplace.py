"""Community template marketplace — publish, browse, clone flows."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from server import db
from models import uid, now
from helpers import get_current_user, audit_log


router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _strip(t: dict) -> dict:
    """Remove tenant-private fields from a marketplace template before returning."""
    safe_keys = {
        "id", "name", "description", "category", "tags", "language",
        "nodes", "edges", "triggers", "translations",
        "author_name", "author_company",
        "downloads", "created_at", "is_featured", "node_count",
        "avg_rating", "rating_count",
    }
    return {k: v for k, v in t.items() if k in safe_keys}


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=600)


@router.post("/publish/{fid}")
async def publish_to_marketplace(fid: str, body: dict, current=Depends(get_current_user)):
    """Publish an existing flow to the public marketplace.

    Body: { name, description, category, tags?: [str] }
    """
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Flow not found")
    nodes = f.get("nodes") or []
    if len(nodes) < 2:
        raise HTTPException(400, "Flow is too small to publish — add at least 2 nodes")

    name = (body.get("name") or f.get("name") or "Untitled flow").strip()[:80]
    description = (body.get("description") or f.get("description") or "").strip()[:400]
    category = (body.get("category") or "Custom").strip()[:30]
    tags = [str(t).strip()[:24] for t in (body.get("tags") or []) if str(t).strip()][:8]
    if not description or len(description) < 10:
        raise HTTPException(400, "Description must be at least 10 characters")

    # Author info
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0}) or {}
    tpl_id = uid()
    doc = {
        "id": tpl_id,
        "name": name,
        "description": description,
        "category": category,
        "tags": tags,
        "language": f.get("language") or "en",
        "nodes": nodes,
        "edges": f.get("edges") or [],
        "triggers": f.get("triggers") or [],
        "translations": f.get("translations") or {},
        "author_tenant_id": current["tenant_id"],
        "author_user_id": current["id"],
        "author_name": current.get("full_name") or "Anonymous",
        "author_company": tenant.get("company_name") or "",
        "source_flow_id": fid,
        "downloads": 0,
        "is_featured": False,
        "node_count": len(nodes),
        "created_at": now().isoformat(),
    }
    await db.marketplace_templates.insert_one({**doc})
    await audit_log(current["tenant_id"], current["id"], "publish_marketplace", tpl_id, {"flow_id": fid})
    return _strip(doc)


@router.get("/templates")
async def list_marketplace(
    current=Depends(get_current_user),
    category: str | None = Query(None),
    search: str | None = Query(None),
    sort: str = Query("recent", pattern="^(recent|popular)$"),
):
    q: dict = {}
    if category and category != "all":
        q["category"] = category
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"tags": {"$regex": search, "$options": "i"}},
        ]
    sort_field = ("downloads" if sort == "popular" else "created_at")
    cur = db.marketplace_templates.find(q, {"_id": 0}).sort(sort_field, -1).limit(100)
    items = await cur.to_list(100)
    return [_strip(t) for t in items]


@router.get("/templates/{tpl_id}")
async def get_marketplace(tpl_id: str, current=Depends(get_current_user)):
    t = await db.marketplace_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    return _strip(t)


@router.post("/templates/{tpl_id}/clone")
async def clone_marketplace(tpl_id: str, body: dict | None = None, current=Depends(get_current_user)):
    """Clone a marketplace template into the current tenant's flows (as draft)."""
    t = await db.marketplace_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    body = body or {}
    fid = uid()
    nodes = t.get("nodes", [])
    start = next((n for n in nodes if n.get("type") == "start"), nodes[0] if nodes else None)
    flow = {
        "id": fid,
        "tenant_id": current["tenant_id"],
        "name": body.get("name") or t["name"],
        "description": t.get("description", ""),
        "credential_id": body.get("credential_id"),
        "status": "draft",
        "triggers": t.get("triggers", []),
        "language": t.get("language") or "en",
        "translations": t.get("translations") or {},
        "nodes": nodes,
        "edges": t.get("edges", []),
        "start_node_id": start.get("id") if start else None,
        "cloned_from_marketplace_id": tpl_id,
        "created_by": current["id"],
        "created_at": now().isoformat(),
        "updated_at": now().isoformat(),
    }
    await db.flows.insert_one({**flow})
    await db.marketplace_templates.update_one({"id": tpl_id}, {"$inc": {"downloads": 1}})
    await audit_log(current["tenant_id"], current["id"], "clone_marketplace", tpl_id, {"flow_id": fid})
    flow.pop("_id", None)
    return flow


@router.delete("/templates/{tpl_id}")
async def delete_marketplace(tpl_id: str, current=Depends(get_current_user)):
    t = await db.marketplace_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    if t.get("author_tenant_id") != current["tenant_id"]:
        raise HTTPException(403, "Only the author can delete this template")
    await db.marketplace_templates.delete_one({"id": tpl_id})
    return {"deleted": True}


@router.get("/categories")
async def categories(current=Depends(get_current_user)):
    """Distinct categories for filtering."""
    cats = await db.marketplace_templates.distinct("category")
    return sorted([c for c in cats if c])


# ============ Reviews & ratings ============
async def _recompute_rating(tpl_id: str) -> tuple[float, int]:
    fresh = await db.marketplace_templates.find_one({"id": tpl_id}, {"_id": 0, "reviews": 1})
    reviews = (fresh or {}).get("reviews") or []
    avg = round(sum(r["rating"] for r in reviews) / len(reviews), 2) if reviews else 0
    await db.marketplace_templates.update_one(
        {"id": tpl_id},
        {"$set": {"avg_rating": avg, "rating_count": len(reviews)}},
    )
    return avg, len(reviews)


@router.post("/templates/{tpl_id}/reviews")
async def submit_review(tpl_id: str, payload: ReviewIn, current=Depends(get_current_user)):
    t = await db.marketplace_templates.find_one({"id": tpl_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Not found")
    if t.get("author_tenant_id") == current["tenant_id"]:
        raise HTTPException(400, "You cannot review your own template")
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0, "company_name": 1}) or {}
    rev = {
        "user_id": current["id"],
        "user_name": current.get("full_name") or current.get("email") or "Anonymous",
        "company": tenant.get("company_name") or "",
        "rating": payload.rating,
        "comment": (payload.comment or "").strip()[:600],
        "created_at": now().isoformat(),
    }
    # Upsert: one review per user per template
    await db.marketplace_templates.update_one({"id": tpl_id}, {"$pull": {"reviews": {"user_id": current["id"]}}})
    await db.marketplace_templates.update_one({"id": tpl_id}, {"$push": {"reviews": rev}})
    avg, count = await _recompute_rating(tpl_id)
    return {"avg_rating": avg, "rating_count": count}


@router.get("/templates/{tpl_id}/reviews")
async def list_reviews(tpl_id: str, current=Depends(get_current_user)):
    t = await db.marketplace_templates.find_one(
        {"id": tpl_id},
        {"_id": 0, "reviews": 1, "avg_rating": 1, "rating_count": 1},
    )
    if not t:
        raise HTTPException(404, "Not found")
    return {
        "avg_rating": t.get("avg_rating", 0),
        "rating_count": t.get("rating_count", 0),
        "reviews": (t.get("reviews") or [])[-50:][::-1],
    }


@router.delete("/templates/{tpl_id}/reviews")
async def delete_my_review(tpl_id: str, current=Depends(get_current_user)):
    await db.marketplace_templates.update_one({"id": tpl_id}, {"$pull": {"reviews": {"user_id": current["id"]}}})
    avg, count = await _recompute_rating(tpl_id)
    return {"deleted": True, "avg_rating": avg, "rating_count": count}
