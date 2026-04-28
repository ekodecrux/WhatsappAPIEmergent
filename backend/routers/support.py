"""Support tickets — tenant raises, super-admin or self responds."""
from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import TicketIn, TicketReplyIn, TicketStatusIn, uid, now
from helpers import get_current_user, require_superadmin, audit_log


router = APIRouter(prefix="/support", tags=["support"])


PRIORITY = {"low", "normal", "high", "urgent"}
STATUSES = {"open", "in_progress", "resolved", "closed"}


# ============ Tenant-side endpoints ============
@router.post("/tickets")
async def create_ticket(payload: TicketIn, current=Depends(get_current_user)):
    if payload.priority not in PRIORITY:
        raise HTTPException(400, f"Invalid priority. Allowed: {sorted(PRIORITY)}")
    tid = uid()
    doc = {
        "id": tid,
        "tenant_id": current["tenant_id"],
        "user_id": current["id"],
        "user_email": current.get("email"),
        "user_name": current.get("full_name"),
        "subject": payload.subject.strip(),
        "description": payload.description.strip(),
        "priority": payload.priority,
        "category": payload.category,
        "source": payload.source,
        "status": "open",
        "replies": [],
        "assigned_to": None,
        "created_at": now().isoformat(),
        "updated_at": now().isoformat(),
    }
    await db.support_tickets.insert_one({**doc})
    await audit_log(current["tenant_id"], current["id"], "create_ticket", tid, {"subject": payload.subject[:60]})
    doc.pop("_id", None)
    return doc


@router.get("/tickets")
async def list_my_tickets(current=Depends(get_current_user)):
    cur = db.support_tickets.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@router.get("/tickets/{tid}")
async def get_ticket(tid: str, current=Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    # Tenant users may only see their tenant's tickets; super-admins see all
    if not current.get("is_superadmin") and t.get("tenant_id") != current["tenant_id"]:
        raise HTTPException(403, "Not authorized")
    return t


@router.post("/tickets/{tid}/reply")
async def reply_to_ticket(tid: str, payload: TicketReplyIn, current=Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    if not current.get("is_superadmin") and t.get("tenant_id") != current["tenant_id"]:
        raise HTTPException(403, "Not authorized")
    if t.get("status") == "closed":
        raise HTTPException(400, "Ticket is closed — reopen first")

    reply = {
        "id": uid(),
        "user_id": current["id"],
        "author_name": current.get("full_name") or current.get("email"),
        "is_staff": bool(current.get("is_superadmin")),
        "message": payload.message.strip(),
        "created_at": now().isoformat(),
    }
    new_status = t.get("status")
    # Auto-bump status when staff replies on an open ticket
    if current.get("is_superadmin") and t.get("status") == "open":
        new_status = "in_progress"
    await db.support_tickets.update_one(
        {"id": tid},
        {"$push": {"replies": reply}, "$set": {"updated_at": now().isoformat(), "status": new_status}},
    )
    return reply


# ============ Super-admin actions ============
@router.patch("/tickets/{tid}")
async def update_ticket_status(tid: str, payload: TicketStatusIn, current=Depends(require_superadmin)):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    upd: dict = {}
    if payload.status is not None:
        if payload.status not in STATUSES:
            raise HTTPException(400, f"Invalid status. Allowed: {sorted(STATUSES)}")
        upd["status"] = payload.status
    if payload.priority is not None:
        if payload.priority not in PRIORITY:
            raise HTTPException(400, f"Invalid priority. Allowed: {sorted(PRIORITY)}")
        upd["priority"] = payload.priority
    if payload.assigned_to is not None:
        upd["assigned_to"] = payload.assigned_to
    if not upd:
        return t
    upd["updated_at"] = now().isoformat()
    await db.support_tickets.update_one({"id": tid}, {"$set": upd})
    await audit_log("platform", current["id"], "admin_update_ticket", tid, upd)
    fresh = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    return fresh
