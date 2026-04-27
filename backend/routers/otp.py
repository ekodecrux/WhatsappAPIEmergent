"""OTP authentication: email + SMS (Twilio Verify)"""
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from server import db
from models import (
    EmailOtpRequestIn, EmailOtpVerifyIn, SmsOtpRequestIn, SmsOtpVerifyIn,
    TokenOut, uid, now,
)
from helpers import (
    generate_otp, store_email_otp, verify_email_otp, send_otp_email,
    send_twilio_verify, check_twilio_verify, run_sync,
    create_token, hash_password, audit_log, trial_days_left,
)


router = APIRouter(prefix="/auth", tags=["auth-otp"])


async def _ensure_user_and_tenant(email: str, full_name: str | None, company: str | None) -> dict:
    """Find or create user + tenant. Used by both email and SMS OTP signup paths."""
    user = await db.users.find_one({"email": email.lower()}, {"_id": 0})
    if user:
        tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
        return {"user": user, "tenant": tenant}

    # signup flow
    tenant_id = uid()
    tenant_doc = {
        "id": tenant_id,
        "company_name": company or (full_name + "'s workspace" if full_name else "My workspace"),
        "plan": "trial",
        "trial_start_date": now().isoformat(),
        "trial_end_date": (now() + timedelta(days=14)).isoformat(),
        "is_active": True,
        "created_at": now().isoformat(),
    }
    await db.tenants.insert_one(tenant_doc)

    user_id = uid()
    user_doc = {
        "id": user_id,
        "tenant_id": tenant_id,
        "email": email.lower(),
        "password_hash": "",  # OTP-only user
        "full_name": full_name or email.split("@")[0],
        "role": "admin",
        "is_active": True,
        "auth_method": "otp",
        "created_at": now().isoformat(),
    }
    await db.users.insert_one(user_doc)
    await audit_log(tenant_id, user_id, "register_otp", "tenant", {"email": email})
    user_doc.pop("_id", None)
    tenant_doc.pop("_id", None)
    return {"user": user_doc, "tenant": tenant_doc}


def _token_response(user: dict, tenant: dict) -> TokenOut:
    return TokenOut(
        access_token=create_token(user["id"], user["tenant_id"]),
        user_id=user["id"],
        tenant_id=user["tenant_id"],
        email=user["email"],
        full_name=user.get("full_name", ""),
        role=user.get("role", "member"),
        company_name=tenant["company_name"],
        plan=tenant.get("plan", "trial"),
        trial_days_left=trial_days_left(tenant),
    )


# ===== Email OTP =====
@router.post("/email/request-otp")
async def email_request_otp(payload: EmailOtpRequestIn):
    code = generate_otp()
    await store_email_otp(payload.email, code, ttl_minutes=5)
    sent = await run_sync(send_otp_email, payload.email, code)
    if not sent:
        # Fallback so dev doesn't get stuck
        return {"sent": False, "channel": "email", "message": "Email send failed; using dev fallback", "dev_code": code}
    return {"sent": True, "channel": "email", "expires_in": 300}


@router.post("/email/verify-otp", response_model=TokenOut)
async def email_verify_otp(payload: EmailOtpVerifyIn):
    ok = await verify_email_otp(payload.email, payload.code)
    if not ok:
        raise HTTPException(400, "Invalid or expired code")
    bundle = await _ensure_user_and_tenant(payload.email, payload.full_name, payload.company_name)
    return _token_response(bundle["user"], bundle["tenant"])


# ===== SMS OTP via Twilio Verify =====
@router.post("/sms/request-otp")
async def sms_request_otp(payload: SmsOtpRequestIn):
    if not payload.phone.startswith("+"):
        raise HTTPException(400, "Phone must be in E.164 format (e.g. +91…)")
    res = await run_sync(send_twilio_verify, payload.phone, "sms")
    if not res.get("success"):
        raise HTTPException(400, f"Twilio Verify failed: {res.get('error')}")
    return {"sent": True, "channel": "sms", "sid": res.get("sid")}


@router.post("/sms/verify-otp", response_model=TokenOut)
async def sms_verify_otp(payload: SmsOtpVerifyIn):
    res = await run_sync(check_twilio_verify, payload.phone, payload.code)
    if not res.get("success"):
        raise HTTPException(400, f"Invalid code: {res.get('status', res.get('error', 'unknown'))}")

    # SMS path requires email to identify/create the user (multi-tenant by email)
    email = payload.email or f"{payload.phone.replace('+','')}@phone.wabridge.local"
    bundle = await _ensure_user_and_tenant(email, payload.full_name, payload.company_name)
    # store phone on user
    await db.users.update_one({"id": bundle["user"]["id"]}, {"$set": {"phone": payload.phone}})
    bundle["user"]["phone"] = payload.phone
    return _token_response(bundle["user"], bundle["tenant"])
