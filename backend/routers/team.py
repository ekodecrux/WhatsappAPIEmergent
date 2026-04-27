"""Team management: invites, members, roles"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import InviteIn, AcceptInviteIn, uid, now
from helpers import (
    get_current_user, audit_log, generate_invite_token, hash_invite_token,
    hash_password, create_token, send_email, run_sync, trial_days_left,
)


router = APIRouter(prefix="/team", tags=["team"])


@router.post("/invites")
async def create_invite(payload: InviteIn, current=Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Only admins can invite teammates")
    if payload.role not in ("admin", "member", "viewer"):
        raise HTTPException(400, "Invalid role")

    existing_user = await db.users.find_one({"email": payload.email.lower(), "tenant_id": current["tenant_id"]})
    if existing_user:
        raise HTTPException(400, "User already in this workspace")

    raw = generate_invite_token()
    invite = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "email": payload.email.lower(),
        "full_name": payload.full_name,
        "role": payload.role,
        "token_hash": hash_invite_token(raw),
        "invited_by": current["id"],
        "expires_at": (now() + timedelta(days=7)).isoformat(),
        "accepted_at": None,
        "created_at": now().isoformat(),
    }
    await db.team_invites.insert_one(invite)
    await audit_log(current["tenant_id"], current["id"], "invite_team", invite["id"], {"email": payload.email})

    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0})
    invite_link = f"/accept-invite?token={raw}"
    html = f"""
    <div style="font-family: -apple-system, Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color:#075E54; margin:0 0 8px 0;">You're invited to {tenant.get('company_name')}</h2>
      <p style="color:#4b5563;">{current.get('full_name') or current['email']} invited you to join their wabridge workspace as a <b>{payload.role}</b>.</p>
      <p>Use this token on the accept-invite page:</p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;font-family:monospace;font-size:12px;word-break:break-all;">{raw}</div>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Invite expires in 7 days. Accept link path: <code>{invite_link}</code></p>
    </div>
    """
    await run_sync(send_email, payload.email, f"Invitation to {tenant.get('company_name')}", html)

    return {"id": invite["id"], "email": invite["email"], "role": invite["role"], "token": raw, "expires_at": invite["expires_at"]}


@router.get("/invites")
async def list_invites(current=Depends(get_current_user)):
    cur = db.team_invites.find({"tenant_id": current["tenant_id"]}, {"_id": 0, "token_hash": 0}).sort("created_at", -1)
    return await cur.to_list(100)


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, current=Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    res = await db.team_invites.delete_one({"id": invite_id, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


@router.post("/accept-invite")
async def accept_invite(payload: AcceptInviteIn):
    """Public endpoint — no auth required."""
    h = hash_invite_token(payload.token)
    invite = await db.team_invites.find_one({"token_hash": h}, {"_id": 0})
    if not invite:
        raise HTTPException(400, "Invalid or already-used invite")
    if invite.get("accepted_at"):
        raise HTTPException(400, "Invite already accepted")
    expires = invite["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(400, "Invite expired")

    # If user with this email already exists -> reject (can't move tenants)
    existing = await db.users.find_one({"email": invite["email"]})
    if existing:
        raise HTTPException(400, "Email already registered. Please sign in.")

    user_id = uid()
    user_doc = {
        "id": user_id,
        "tenant_id": invite["tenant_id"],
        "email": invite["email"],
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name or invite.get("full_name") or invite["email"].split("@")[0],
        "role": invite["role"],
        "is_active": True,
        "auth_method": "password",
        "created_at": now().isoformat(),
    }
    await db.users.insert_one(user_doc)
    await db.team_invites.update_one({"id": invite["id"]}, {"$set": {"accepted_at": now().isoformat(), "user_id": user_id}})

    tenant = await db.tenants.find_one({"id": invite["tenant_id"]}, {"_id": 0})
    return {
        "access_token": create_token(user_id, invite["tenant_id"]),
        "token_type": "bearer",
        "user_id": user_id,
        "tenant_id": invite["tenant_id"],
        "email": user_doc["email"],
        "full_name": user_doc["full_name"],
        "role": user_doc["role"],
        "company_name": tenant.get("company_name", ""),
        "plan": tenant.get("plan", "trial"),
        "trial_days_left": trial_days_left(tenant),
    }


@router.get("/members")
async def list_members(current=Depends(get_current_user)):
    cur = db.users.find({"tenant_id": current["tenant_id"]}, {"_id": 0, "password_hash": 0}).sort("created_at", 1)
    members = await cur.to_list(200)
    return members


@router.patch("/members/{member_id}")
async def update_member(member_id: str, body: dict, current=Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    if member_id == current["id"] and body.get("role") and body["role"] != "admin":
        raise HTTPException(400, "Cannot demote yourself")
    upd = {}
    if "role" in body and body["role"] in ("admin", "member", "viewer"):
        upd["role"] = body["role"]
    if "is_active" in body:
        upd["is_active"] = bool(body["is_active"])
    if not upd:
        return {"updated": 0}
    res = await db.users.update_one({"id": member_id, "tenant_id": current["tenant_id"]}, {"$set": upd})
    await audit_log(current["tenant_id"], current["id"], "update_member", member_id, upd)
    return {"updated": res.modified_count}


@router.delete("/members/{member_id}")
async def remove_member(member_id: str, current=Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    if member_id == current["id"]:
        raise HTTPException(400, "Cannot remove yourself")
    res = await db.users.delete_one({"id": member_id, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}
