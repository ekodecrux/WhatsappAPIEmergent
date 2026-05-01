"""RBAC-F7 — MFA (TOTP) enrollment, verification, and admin policy.

Flow:
  1. User visits Settings → Security → "Enable MFA"
  2. POST /api/mfa/enroll returns {secret, qr_data_url, backup_codes[]}
  3. User scans QR in Google Authenticator / 1Password
  4. POST /api/mfa/verify-enroll with 6-digit code → mfa_enabled=true, secret persisted
  5. Backup codes hashed+stored; shown to user ONCE then gone

Login:
  - /api/auth/login returns mfa_required=true + challenge_token (60s) for mfa_enabled users
  - Frontend POSTs /api/mfa/challenge {challenge_token, code} → final access_token

Disable:
  - POST /api/mfa/disable {password, code} — require current creds + live code
"""
from __future__ import annotations
import base64
import hashlib
import io
import os
import secrets
from datetime import datetime, timezone, timedelta

import pyotp
import qrcode
import jwt as _jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import db
from helpers import get_current_user, verify_password, create_token, audit_log, encrypt_text, decrypt_text
from rbac import normalize_role

router = APIRouter(prefix="/mfa", tags=["mfa"])

ISSUER = "wabridge"
CHALLENGE_TTL_SECONDS = 120


def _hash_backup(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _gen_backup_codes(n: int = 8) -> list[str]:
    """8 one-time backup codes, format XXXX-XXXX."""
    codes = []
    for _ in range(n):
        raw = secrets.token_hex(4).upper()
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


def _qr_data_url(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def mfa_required_for_role(role: str | None) -> bool:
    """Roles mandated to enroll MFA per RBAC-F7."""
    return normalize_role(role) in {"owner", "admin", "billing_manager"}


# ============ Enrollment ============
@router.post("/enroll")
async def enroll(current=Depends(get_current_user)):
    """Start MFA enrollment. Returns a TOTP URI + QR code to display."""
    if current.get("mfa_enabled"):
        raise HTTPException(400, "MFA already enabled. Disable first to re-enroll.")
    secret = pyotp.random_base32()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=current["email"], issuer_name=ISSUER)
    qr = _qr_data_url(uri)
    # Stash pending secret (not yet active)
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"mfa_secret_pending": encrypt_text(secret), "mfa_enroll_started_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"secret": secret, "qr_data_url": qr, "provisioning_uri": uri, "issuer": ISSUER}


class VerifyEnrollIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.post("/verify-enroll")
async def verify_enroll(payload: VerifyEnrollIn, current=Depends(get_current_user)):
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    pending = u.get("mfa_secret_pending")
    if not pending:
        raise HTTPException(400, "No pending MFA enrollment. Start with /mfa/enroll first.")
    try:
        secret = decrypt_text(pending)
    except Exception:
        raise HTTPException(400, "Pending secret corrupted. Restart enrollment.")
    if not pyotp.TOTP(secret).verify(payload.code.strip(), valid_window=1):
        raise HTTPException(400, "Invalid 6-digit code. Check your authenticator app clock.")

    # Generate backup codes
    backup_codes = _gen_backup_codes()
    backup_hashed = [_hash_backup(c) for c in backup_codes]
    await db.users.update_one(
        {"id": current["id"]},
        {
            "$set": {
                "mfa_enabled": True,
                "mfa_secret": pending,  # keep encrypted
                "mfa_backup_hashes": backup_hashed,
                "mfa_enabled_at": datetime.now(timezone.utc).isoformat(),
            },
            "$unset": {"mfa_secret_pending": "", "mfa_enroll_started_at": ""},
        },
    )
    await audit_log(current["tenant_id"], current["id"], "mfa.enabled", current["id"])
    return {"enabled": True, "backup_codes": backup_codes, "warning": "Save these backup codes somewhere safe — they won't be shown again."}


class DisableIn(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=12)


@router.post("/disable")
async def disable_mfa(payload: DisableIn, current=Depends(get_current_user)):
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    if not u.get("mfa_enabled"):
        raise HTTPException(400, "MFA is not currently enabled")
    if not verify_password(payload.password, u.get("password_hash", "")):
        raise HTTPException(401, "Invalid password")
    try:
        secret = decrypt_text(u["mfa_secret"])
    except Exception:
        raise HTTPException(500, "Secret not decryptable")
    code = payload.code.strip()
    ok = pyotp.TOTP(secret).verify(code, valid_window=1) or _hash_backup(code) in (u.get("mfa_backup_hashes") or [])
    if not ok:
        raise HTTPException(400, "Invalid MFA code")
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"mfa_enabled": False}, "$unset": {"mfa_secret": "", "mfa_backup_hashes": ""}},
    )
    await audit_log(current["tenant_id"], current["id"], "mfa.disabled", current["id"])
    return {"disabled": True}


@router.get("/status")
async def status(current=Depends(get_current_user)):
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "password_hash": 0, "mfa_secret": 0, "mfa_secret_pending": 0})
    return {
        "mfa_enabled": bool(u.get("mfa_enabled")),
        "required_by_role": mfa_required_for_role(u.get("role")),
        "backup_codes_remaining": len(u.get("mfa_backup_hashes", []) or []),
    }


# ============ Login challenge ============
class ChallengeIn(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=12)


@router.post("/challenge")
async def challenge(payload: ChallengeIn):
    """Second-factor verification at login — returns the real access_token on success."""
    try:
        p = _jwt.decode(
            payload.challenge_token,
            os.environ["JWT_SECRET"],
            algorithms=[os.environ.get("JWT_ALGORITHM", "HS256")],
        )
    except Exception:
        raise HTTPException(401, "Invalid or expired challenge. Please log in again.")
    if p.get("purpose") != "mfa_challenge":
        raise HTTPException(401, "Invalid challenge token")
    user = await db.users.find_one({"id": p["sub"]}, {"_id": 0})
    if not user or not user.get("mfa_enabled"):
        raise HTTPException(401, "User not found or MFA not enabled")
    try:
        secret = decrypt_text(user["mfa_secret"])
    except Exception:
        raise HTTPException(500, "Secret not decryptable")

    code = payload.code.strip()
    ok = pyotp.TOTP(secret).verify(code, valid_window=1)
    used_backup = False
    if not ok:
        # try backup code
        hashed = _hash_backup(code)
        if hashed in (user.get("mfa_backup_hashes") or []):
            ok = True
            used_backup = True
            # invalidate used backup
            await db.users.update_one({"id": user["id"]}, {"$pull": {"mfa_backup_hashes": hashed}})

    if not ok:
        await audit_log(user["tenant_id"], user["id"], "mfa.challenge_failed", user["id"])
        raise HTTPException(400, "Invalid MFA code")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat(), "last_login_method": "mfa_backup" if used_backup else "mfa_totp"}},
    )
    await audit_log(user["tenant_id"], user["id"], "mfa.challenge_success", user["id"], {"backup_used": used_backup})

    token = create_token(user["id"], user["tenant_id"])
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user["id"],
        "tenant_id": user["tenant_id"],
        "email": user["email"],
        "full_name": user.get("full_name", ""),
        "role": user.get("role", "viewer"),
        "company_name": (tenant or {}).get("company_name", ""),
        "plan": (tenant or {}).get("plan", "free"),
        "is_superadmin": bool(user.get("is_superadmin")),
        "trial_days_left": 0,
        "backup_used": used_backup,
    }


def build_challenge_token(user_id: str) -> str:
    """Mint a short-lived MFA challenge token (used by /auth/login)."""
    now = datetime.now(timezone.utc)
    return _jwt.encode(
        {
            "sub": user_id,
            "purpose": "mfa_challenge",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=CHALLENGE_TTL_SECONDS)).timestamp()),
        },
        os.environ["JWT_SECRET"],
        algorithm=os.environ.get("JWT_ALGORITHM", "HS256"),
    )
