"""Auth: register, login, me"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import RegisterIn, LoginIn, TokenOut, uid, now
from helpers import (
    hash_password, verify_password, create_token, get_current_user,
    audit_log, trial_days_left, resolve_plan, send_email
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
async def register(payload: RegisterIn):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    tenant_id = uid()
    tenant_doc = {
        "id": tenant_id,
        "company_name": payload.company_name,
        "plan": "free",
        "trial_start_date": now().isoformat(),
        "trial_end_date": (now() + timedelta(days=365)).isoformat(),
        "is_active": True,
        "created_at": now().isoformat(),
    }
    await db.tenants.insert_one(tenant_doc)

    user_id = uid()
    user_doc = {
        "id": user_id,
        "tenant_id": tenant_id,
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "role": "admin",
        "is_active": True,
        "created_at": now().isoformat(),
    }
    await db.users.insert_one(user_doc)
    await audit_log(tenant_id, user_id, "register", "tenant", {"company": payload.company_name})

    # Best-effort welcome email (no failure)
    try:
        send_email(
            payload.email,
            f"Welcome to wabridge, {payload.full_name}!",
            f"<h2>Welcome aboard</h2><p>Your <b>Free</b> plan for <b>{payload.company_name}</b> is now active. Upgrade to Starter (₹499) or Pro (₹999) anytime.</p>",
        )
    except Exception:
        pass

    token = create_token(user_id, tenant_id)
    return TokenOut(
        access_token=token,
        user_id=user_id,
        tenant_id=tenant_id,
        email=payload.email.lower(),
        full_name=payload.full_name,
        role="admin",
        company_name=payload.company_name,
        plan="free",
        trial_days_left=365,
    )


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=400, detail="Tenant not found")

    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": now().isoformat()}})

    token = create_token(user["id"], user["tenant_id"])
    return TokenOut(
        access_token=token,
        user_id=user["id"],
        tenant_id=user["tenant_id"],
        email=user["email"],
        full_name=user.get("full_name", ""),
        role=user.get("role", "member"),
        company_name=tenant["company_name"],
        plan=resolve_plan(tenant.get("plan", "free")),
        trial_days_left=trial_days_left(tenant),
        is_superadmin=bool(user.get("is_superadmin")),
    )


@router.get("/me")
async def me(current=Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0})
    return {
        "user": current,
        "tenant": tenant,
        "trial_days_left": trial_days_left(tenant) if tenant else 0,
    }
