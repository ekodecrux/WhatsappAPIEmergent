"""Auth, encryption, integration helpers"""
import os
import asyncio
import base64
import hashlib
import hmac
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import jwt
import bcrypt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorDatabase

from server import db


# ================ Auth ================
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "168"))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except Exception:
        return False


def create_token(user_id: str, tenant_id: str) -> str:
    payload = {
        "sub": user_id,
        "tid": tenant_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Super-admin only")
    return user


# ================ Encryption ================
def _fernet_key() -> bytes:
    raw = os.environ["ENCRYPTION_KEY"].encode()
    digest = hashlib.sha256(raw).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_fernet_key())


def encrypt_text(plain: str) -> str:
    if not plain:
        return ""
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_text(token: str) -> str:
    if not token:
        return ""
    return _fernet.decrypt(token.encode()).decode()


def mask(text: str, keep: int = 4) -> str:
    if not text:
        return ""
    if len(text) <= keep * 2:
        return "•" * len(text)
    return text[:keep] + "•" * (len(text) - keep * 2) + text[-keep:]


# ================ Audit ================
async def audit_log(tenant_id: str, user_id: str, action: str, resource: str = "", details: dict | None = None):
    await db.audit_logs.insert_one({
        "id": secrets.token_hex(8),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": action,
        "resource": resource,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


# ================ Plans ================
# Three-tier SaaS pricing:
#   free    — perpetual free entry tier
#   starter — ₹499 / mo
#   pro     — ₹999 / mo
# Legacy slugs (trial/basic/enterprise) are aliased below for back-compat with existing tenants.
PLANS = {
    "free": {"name": "Free", "price_inr": 0, "annual_inr": 0, "messages": 100, "leads": 100, "credentials": 1, "duration_days": 365},
    "starter": {"name": "Starter", "price_inr": 499, "annual_inr": 4990, "messages": 5000, "leads": 1000, "credentials": 1, "duration_days": 30},
    "pro": {"name": "Pro", "price_inr": 999, "annual_inr": 9990, "messages": 25000, "leads": 10000, "credentials": 3, "duration_days": 30},
}

# Legacy slug → new slug (so older tenants & docs keep working)
PLAN_ALIASES = {"trial": "free", "basic": "starter", "enterprise": "pro"}


def resolve_plan(slug: str | None) -> str:
    """Resolve legacy plan slugs (trial/basic/enterprise) to current tier names."""
    if not slug:
        return "free"
    return PLAN_ALIASES.get(slug, slug)


def trial_days_left(tenant: dict) -> int:
    """Days left on the free tier (capped at duration_days)."""
    plan = resolve_plan(tenant.get("plan"))
    if plan != "free":
        return 0
    end = tenant.get("trial_end_date") or tenant.get("free_end_date")
    if isinstance(end, str):
        end = datetime.fromisoformat(end)
    if not end:
        return 0
    now = datetime.now(timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    delta = (end - now).days
    return max(0, delta)


# ================ Twilio integration ================
def get_twilio_client(account_sid: str | None = None, auth_token: str | None = None):
    from twilio.rest import Client
    sid = account_sid or os.environ["TWILIO_ACCOUNT_SID"]
    tok = auth_token or os.environ["TWILIO_AUTH_TOKEN"]
    return Client(sid, tok)


def send_whatsapp_via_twilio(account_sid: str, auth_token: str, from_addr: str, to_phone: str, body: str, media_url: str | None = None) -> dict:
    """Send WhatsApp text (and optional media) via Twilio. to_phone in E.164 format."""
    try:
        c = get_twilio_client(account_sid, auth_token)
        if not to_phone.startswith("whatsapp:"):
            to_phone = f"whatsapp:{to_phone}"
        kwargs: dict = {"from_": from_addr, "to": to_phone, "body": body or ""}
        if media_url:
            kwargs["media_url"] = [media_url]
        msg = c.messages.create(**kwargs)
        return {"success": True, "sid": msg.sid, "status": msg.status}
    except Exception as e:
        return {"success": False, "error": str(e)}


def validate_twilio_credentials(account_sid: str, auth_token: str) -> bool:
    try:
        c = get_twilio_client(account_sid, auth_token)
        c.api.v2010.accounts(account_sid).fetch()
        return True
    except Exception:
        return False


# ================ Meta Cloud (WhatsApp Business Cloud API) ================
META_GRAPH_BASE = os.environ.get("META_GRAPH_BASE", "https://graph.facebook.com/v20.0")


def validate_meta_credentials(access_token: str, phone_number_id: str) -> dict:
    """Verify a Meta Cloud token + phone number ID by calling the Graph API.

    Returns: {"success": bool, "display_phone_number": str, "verified_name": str, "error": str?}
    """
    import requests
    try:
        url = f"{META_GRAPH_BASE}/{phone_number_id}"
        r = requests.get(url, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        if r.status_code == 200:
            data = r.json()
            return {
                "success": True,
                "display_phone_number": data.get("display_phone_number", ""),
                "verified_name": data.get("verified_name", ""),
            }
        try:
            err = r.json().get("error", {})
            msg = err.get("message") or err.get("type") or f"HTTP {r.status_code}"
        except Exception:
            msg = f"HTTP {r.status_code}: {r.text[:200]}"
        return {"success": False, "error": msg}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_whatsapp_via_meta(access_token: str, phone_number_id: str, to_phone: str, body: str, media_url: str | None = None, media_type: str | None = None) -> dict:
    """Send a text or media message via Meta Cloud API.

    to_phone: E.164 with leading + (e.g., '+919876543210') — Meta requires no '+' prefix.
    media_type: image | document | audio | video — required if media_url is provided.
    """
    import requests
    try:
        clean_to = to_phone.replace("whatsapp:", "").lstrip("+")
        url = f"{META_GRAPH_BASE}/{phone_number_id}/messages"
        if media_url and media_type in ("image", "document", "audio", "video"):
            media_payload: dict = {"link": media_url}
            if body and media_type in ("image", "document", "video"):
                media_payload["caption"] = body
            payload = {
                "messaging_product": "whatsapp",
                "to": clean_to,
                "type": media_type,
                media_type: media_payload,
            }
        else:
            payload = {
                "messaging_product": "whatsapp",
                "to": clean_to,
                "type": "text",
                "text": {"body": body or ""},
            }
        r = requests.post(url, json=payload, headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
        if r.status_code in (200, 201):
            data = r.json()
            mid = (data.get("messages") or [{}])[0].get("id", "")
            return {"success": True, "sid": mid, "status": "sent"}
        try:
            err = r.json().get("error", {})
            msg = err.get("message") or f"HTTP {r.status_code}"
        except Exception:
            msg = f"HTTP {r.status_code}: {r.text[:200]}"
        return {"success": False, "error": msg}
    except Exception as e:
        return {"success": False, "error": str(e)}


def send_whatsapp(cred: dict, to_phone: str, body: str, media_url: str | None = None, media_type: str | None = None) -> dict:
    """Provider-aware WhatsApp send with optional media attachment."""
    provider = (cred or {}).get("provider", "twilio_sandbox")
    if provider == "meta_cloud":
        access_token = decrypt_text(cred.get("auth_token_enc", ""))
        return send_whatsapp_via_meta(access_token, cred.get("phone_number_id", ""), to_phone, body, media_url, media_type)
    sid = decrypt_text(cred.get("account_sid_enc", ""))
    tok = decrypt_text(cred.get("auth_token_enc", ""))
    return send_whatsapp_via_twilio(sid, tok, cred.get("whatsapp_from", ""), to_phone, body, media_url)


async def send_whatsapp_billed(db, tenant_id: str, cred: dict, to_phone: str, body: str,
                               media_url: str | None = None, media_type: str | None = None,
                               category: str = "marketing", note: str | None = None) -> dict:
    """Wallet-aware send. Charges the tenant's wallet (if billing_mode='wallet') BEFORE sending,
    refunds on provider failure. For 'byoc' tenants, no wallet interaction.
    """
    from wallet import charge_wallet, credit_wallet
    charge = await charge_wallet(db, tenant_id, category=category, note=note,
                                 meta={"to_phone": to_phone[-4:] if to_phone else ""})
    # If we're on wallet plan and balance was insufficient, fail fast
    if not charge.get("success") and charge.get("reason") == "insufficient_balance":
        return {
            "success": False,
            "error": (
                f"Wallet balance ₹{charge.get('balance', 0):.2f} is below the per-message price "
                f"₹{charge.get('price', 0):.2f}. Please top up to continue."
            ),
            "billing": {"reason": "insufficient_balance", **charge},
        }

    # Send via provider
    result = await run_sync(send_whatsapp, cred, to_phone, body, media_url, media_type)

    # Refund if provider failed AND we actually charged
    if charge.get("success") and (charge.get("price") or 0) > 0 and not result.get("success"):
        try:
            await credit_wallet(
                db, tenant_id, float(charge["price"]),
                type_="refund",
                note=f"Refund (send failed: {(result.get('error') or '')[:60]})",
                meta={"orig_txn_id": charge.get("txn_id")},
            )
        except Exception as e:
            print(f"[wallet] refund failed: {e}")

    # Pass-through billing data so callers can include in API responses
    if charge.get("success"):
        result["billing"] = {
            "charged": True,
            "price_inr": charge["price"],
            "new_balance_inr": charge["new_balance"],
            "category": charge.get("category"),
        }
    elif charge.get("reason") == "byoc":
        result["billing"] = {"charged": False, "reason": "byoc"}
    return result


def verify_meta_webhook_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """Verify Meta webhook X-Hub-Signature-256 against META_APP_SECRET.

    Returns True if signature matches OR if META_APP_SECRET isn't configured (dev mode).
    Production: ALWAYS configure META_APP_SECRET so spoofed inbounds are rejected.
    """
    import hmac
    import hashlib
    secret = os.environ.get("META_APP_SECRET", "").strip()
    if not secret:
        # Dev mode: skip verification but log a warning at module level (caller decides)
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header.split("=", 1)[1]
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


# ================ Groq AI ================
def groq_chat(system: str, user_msg: str, max_tokens: int = 200) -> str:
    """Call Groq for completion, fallback if not available."""
    try:
        from groq import Groq
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=max_tokens,
            temperature=0.7,
        )
        return resp.choices[0].message.content or ""
    except Exception as e:
        return f"[AI unavailable: {e}]"


def ai_suggest_reply(incoming: str, context: str = "") -> str:
    sys_prompt = (
        "You are a helpful B2B WhatsApp customer-service assistant. "
        "Reply concisely (under 200 chars), friendly and professional. "
        "Plain text only. No emojis. No markdown."
    )
    user = f"Customer message: {incoming}\nContext: {context}\n\nWrite a short, helpful reply."
    return groq_chat(sys_prompt, user, max_tokens=160)


def ai_analyze_sentiment(message: str) -> dict:
    sys_prompt = (
        "Classify the sentiment of the message in one word: positive, neutral, or negative. "
        "Then on the next line, give a lead_score from 0-100 indicating buying interest. "
        "Format: SENTIMENT|SCORE"
    )
    raw = groq_chat(sys_prompt, message, max_tokens=20)
    try:
        s, sc = raw.strip().split("|")
        return {"sentiment": s.strip().lower(), "lead_score": int(sc.strip())}
    except Exception:
        return {"sentiment": "neutral", "lead_score": 50}


# ================ Razorpay ================
def get_razorpay_client():
    import razorpay
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


def create_razorpay_order(amount_inr: int, receipt: str, notes: dict | None = None) -> dict:
    try:
        c = get_razorpay_client()
        order = c.order.create({
            "amount": amount_inr * 100,  # paise
            "currency": "INR",
            "receipt": receipt,
            "notes": notes or {},
        })
        return {"success": True, "order": order, "key_id": os.environ["RAZORPAY_KEY_ID"]}
    except Exception as e:
        return {"success": False, "error": str(e)}


def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    try:
        c = get_razorpay_client()
        c.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except Exception:
        return False


# ================ Email ================
def send_email(to: str, subject: str, html: str) -> bool:
    try:
        sender = os.environ["GMAIL_SENDER"]
        password = os.environ["GMAIL_APP_PASSWORD"]
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as srv:
            srv.starttls()
            srv.login(sender, password)
            srv.sendmail(sender, [to], msg.as_string())
        return True
    except Exception as e:
        print(f"[email] failed: {e}")
        return False


# ================ API Key (for ERP integrations) ================
def generate_api_key() -> tuple[str, str]:
    """Returns (raw_key, key_hash)"""
    raw = "wsk_" + secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode()).hexdigest()
    return raw, h


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def get_tenant_from_api_key(x_api_key: str | None = Header(default=None)) -> dict:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    h = hash_api_key(x_api_key)
    rec = await db.api_keys.find_one({"key_hash": h, "is_active": True}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=401, detail="Invalid API key")
    tenant = await db.tenants.find_one({"id": rec["tenant_id"]}, {"_id": 0})
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=403, detail="Tenant inactive")
    # Update usage
    await db.api_keys.update_one(
        {"key_hash": h},
        {"$inc": {"call_count": 1}, "$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"tenant": tenant, "api_key": rec}


async def update_usage(tenant_id: str, field: str, increment: int = 1):
    today = datetime.now(timezone.utc).date().isoformat()
    await db.usage_metrics.update_one(
        {"tenant_id": tenant_id, "date": today},
        {"$inc": {field: increment}, "$setOnInsert": {"tenant_id": tenant_id, "date": today}},
        upsert=True,
    )


# ================ Async wrappers for sync SDKs ================
async def run_sync(fn, *args, **kwargs):
    """Run a sync (blocking) function in the default executor — keeps event loop free."""
    loop = asyncio.get_event_loop()
    if kwargs:
        from functools import partial
        fn = partial(fn, *args, **kwargs)
        return await loop.run_in_executor(None, fn)
    return await loop.run_in_executor(None, fn, *args)


# ================ OTP (email + sms via Twilio Verify) ================
def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(code: str, email_or_phone: str) -> str:
    """Hash OTP with channel salt to prevent cross-channel reuse."""
    return hashlib.sha256(f"{code}:{email_or_phone}".encode()).hexdigest()


async def store_email_otp(email: str, code: str, ttl_minutes: int = 5):
    expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    await db.otp_codes.update_one(
        {"channel": "email", "identifier": email.lower()},
        {"$set": {
            "channel": "email",
            "identifier": email.lower(),
            "code_hash": hash_otp(code, email.lower()),
            "expires_at": expires.isoformat(),
            "attempts": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


async def verify_email_otp(email: str, code: str) -> bool:
    rec = await db.otp_codes.find_one({"channel": "email", "identifier": email.lower()}, {"_id": 0})
    if not rec:
        return False
    if rec.get("attempts", 0) >= 5:
        return False
    expires = datetime.fromisoformat(rec["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        return False
    expected = rec["code_hash"]
    actual = hash_otp(code, email.lower())
    if not hmac.compare_digest(expected, actual):
        await db.otp_codes.update_one({"channel": "email", "identifier": email.lower()}, {"$inc": {"attempts": 1}})
        return False
    await db.otp_codes.delete_one({"channel": "email", "identifier": email.lower()})
    return True


def send_otp_email(to: str, code: str) -> bool:
    html = f"""
    <div style="font-family: -apple-system, Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #075E54; margin: 0 0 8px 0;">Your verification code</h2>
      <p style="color: #4b5563; margin: 0 0 24px 0;">Use the code below to continue. It expires in 5 minutes.</p>
      <div style="background:#f3f4f6; border-radius:8px; padding:24px; text-align:center;">
        <div style="font-size:36px; letter-spacing:12px; font-weight:700; color:#075E54; font-family:monospace;">{code}</div>
      </div>
      <p style="color:#9ca3af; font-size:12px; margin-top:24px;">If you didn't request this, you can ignore this email.</p>
    </div>
    """
    return send_email(to, f"Your wabridge code: {code}", html)


def send_twilio_verify(phone: str, channel: str = "sms") -> dict:
    """Trigger Twilio Verify OTP."""
    try:
        c = get_twilio_client()
        v = c.verify.v2.services(os.environ["TWILIO_VERIFY_SID"]).verifications.create(to=phone, channel=channel)
        return {"success": True, "sid": v.sid, "status": v.status}
    except Exception as e:
        return {"success": False, "error": str(e)}


def check_twilio_verify(phone: str, code: str) -> dict:
    try:
        c = get_twilio_client()
        ck = c.verify.v2.services(os.environ["TWILIO_VERIFY_SID"]).verification_checks.create(to=phone, code=code)
        return {"success": ck.status == "approved", "status": ck.status}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ================ Team invites ================
def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
