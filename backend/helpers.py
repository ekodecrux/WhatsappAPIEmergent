"""Auth, encryption, integration helpers"""
import os
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
PLANS = {
    "trial": {"name": "Trial", "price_inr": 0, "messages": 100, "leads": 100, "credentials": 1, "duration_days": 14},
    "basic": {"name": "Basic", "price_inr": 999, "messages": 5000, "leads": 1000, "credentials": 1, "duration_days": 30},
    "pro": {"name": "Pro", "price_inr": 2999, "messages": 50000, "leads": 10000, "credentials": 3, "duration_days": 30},
    "enterprise": {"name": "Enterprise", "price_inr": 9999, "messages": 500000, "leads": 100000, "credentials": 10, "duration_days": 30},
}


def trial_days_left(tenant: dict) -> int:
    if tenant.get("plan") != "trial":
        return 0
    end = tenant.get("trial_end_date")
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


def send_whatsapp_via_twilio(account_sid: str, auth_token: str, from_addr: str, to_phone: str, body: str) -> dict:
    """Send WhatsApp text via Twilio. to_phone in E.164 format."""
    try:
        c = get_twilio_client(account_sid, auth_token)
        if not to_phone.startswith("whatsapp:"):
            to_phone = f"whatsapp:{to_phone}"
        msg = c.messages.create(from_=from_addr, to=to_phone, body=body)
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
