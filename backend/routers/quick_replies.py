"""Saved snippets / quick replies for live chat agents.

Agents type `/` in chat to insert a saved snippet. Tenant-scoped.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import db
from models import uid, now
from helpers import get_current_user


router = APIRouter(prefix="/quick-replies", tags=["quick-replies"])


class QuickReplyIn(BaseModel):
    shortcut: str = Field(min_length=1, max_length=24)  # e.g. "pricing", "hours"
    body: str = Field(min_length=1, max_length=1000)
    category: str = "general"


@router.get("")
async def list_replies(current=Depends(get_current_user)):
    cur = db.quick_replies.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("shortcut", 1)
    return await cur.to_list(200)


@router.post("")
async def create_reply(payload: QuickReplyIn, current=Depends(get_current_user)):
    sc = payload.shortcut.strip().lower().replace(" ", "_")
    existing = await db.quick_replies.find_one(
        {"tenant_id": current["tenant_id"], "shortcut": sc}, {"_id": 0},
    )
    if existing:
        raise HTTPException(400, f"Shortcut '/{sc}' already exists")
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "shortcut": sc,
        "body": payload.body,
        "category": payload.category,
        "use_count": 0,
        "created_by": current["id"],
        "created_at": now().isoformat(),
    }
    await db.quick_replies.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{rid}")
async def update_reply(rid: str, payload: QuickReplyIn, current=Depends(get_current_user)):
    sc = payload.shortcut.strip().lower().replace(" ", "_")
    res = await db.quick_replies.update_one(
        {"id": rid, "tenant_id": current["tenant_id"]},
        {"$set": {"shortcut": sc, "body": payload.body, "category": payload.category,
                  "updated_at": now().isoformat()}},
    )
    if not res.matched_count:
        raise HTTPException(404, "Quick reply not found")
    fresh = await db.quick_replies.find_one({"id": rid}, {"_id": 0})
    return fresh


@router.delete("/{rid}")
async def delete_reply(rid: str, current=Depends(get_current_user)):
    res = await db.quick_replies.delete_one({"id": rid, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


@router.post("/{rid}/use")
async def mark_used(rid: str, current=Depends(get_current_user)):
    await db.quick_replies.update_one(
        {"id": rid, "tenant_id": current["tenant_id"]}, {"$inc": {"use_count": 1}},
    )
    return {"ok": True}
