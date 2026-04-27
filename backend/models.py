"""Pydantic models for WhatsApp SaaS"""
from datetime import datetime, timezone
from typing import Any
from pydantic import BaseModel, EmailStr, Field
import uuid


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> str:
    return str(uuid.uuid4())


# ===== Auth =====
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    company_name: str
    full_name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str
    email: str
    full_name: str
    role: str
    company_name: str
    plan: str
    trial_days_left: int


# ===== WhatsApp Credentials =====
class CredentialIn(BaseModel):
    name: str
    provider: str = "twilio_sandbox"  # twilio_sandbox | twilio | meta_cloud
    account_sid: str | None = None
    auth_token: str | None = None
    whatsapp_from: str | None = None  # e.g., "whatsapp:+14155238886"
    access_token: str | None = None  # Meta API
    phone_number_id: str | None = None  # Meta API
    business_account_id: str | None = None


class CredentialOut(BaseModel):
    id: str
    name: str
    provider: str
    whatsapp_from: str | None = None
    phone_number_id: str | None = None
    is_verified: bool
    status: str
    created_at: datetime


# ===== Templates =====
class TemplateIn(BaseModel):
    name: str
    category: str = "MARKETING"
    body: str
    header: str | None = None
    footer: str | None = None
    language: str = "en"


# ===== Campaigns =====
class CampaignIn(BaseModel):
    name: str
    credential_id: str
    message: str
    recipients: list[str]  # list of phone numbers in E.164 format
    schedule_at: datetime | None = None


class CampaignApprove(BaseModel):
    approve: bool = True


# ===== Leads =====
class LeadIn(BaseModel):
    phone: str
    name: str | None = None
    email: str | None = None
    company: str | None = None
    source: str = "manual"
    notes: str | None = None
    custom_fields: dict[str, Any] | None = None


class LeadUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    company: str | None = None
    status: str | None = None
    notes: str | None = None
    lead_score: int | None = None
    assigned_to: str | None = None


# ===== Chat =====
class SendMessageIn(BaseModel):
    credential_id: str
    to_phone: str
    content: str


class ConversationCreateIn(BaseModel):
    credential_id: str
    customer_phone: str
    customer_name: str | None = None


# ===== Auto-Reply =====
class AutoReplyRuleIn(BaseModel):
    name: str
    credential_id: str
    trigger_keywords: list[str] = []
    trigger_type: str = "keyword"  # keyword | greeting | always
    reply_message: str
    is_active: bool = True
    priority: int = 0


# ===== Billing =====
class CheckoutOrderIn(BaseModel):
    plan: str  # basic | pro | enterprise


class VerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan: str


# ===== ERP/Integrations =====
class ApiKeyIn(BaseModel):
    name: str
    scopes: list[str] = ["send_message", "create_lead"]


class WebhookIn(BaseModel):
    name: str
    url: str
    events: list[str] = ["message.received", "message.status"]
    secret: str | None = None


class ErpSendMessageIn(BaseModel):
    """Used by external ERP systems via API key auth"""
    credential_id: str | None = None
    to_phone: str
    message: str
