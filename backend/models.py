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


class EmailOtpRequestIn(BaseModel):
    email: EmailStr
    company_name: str | None = None  # only for signup
    full_name: str | None = None     # only for signup
    purpose: str = "login"           # "login" or "signup"


class EmailOtpVerifyIn(BaseModel):
    email: EmailStr
    code: str
    company_name: str | None = None
    full_name: str | None = None
    purpose: str = "login"


class SmsOtpRequestIn(BaseModel):
    phone: str  # E.164 format e.g. +919876543210
    company_name: str | None = None
    full_name: str | None = None
    email: EmailStr | None = None
    purpose: str = "login"


class SmsOtpVerifyIn(BaseModel):
    phone: str
    code: str
    company_name: str | None = None
    full_name: str | None = None
    email: EmailStr | None = None
    purpose: str = "login"


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
    is_superadmin: bool = False


# ===== Support tickets =====
class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=4000)
    priority: str = "normal"  # low | normal | high | urgent
    category: str = "general"  # general | billing | technical | bug | feature
    source: str = "manual"  # manual | chatbot


class TicketReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class TicketStatusIn(BaseModel):
    status: str | None = None  # open | in_progress | resolved | closed
    priority: str | None = None
    assigned_to: str | None = None


# ===== Admin / Tenant management =====
class TenantUpdateIn(BaseModel):
    plan: str | None = None  # trial | basic | pro | enterprise
    is_active: bool | None = None
    extend_trial_days: int | None = None  # adds N days to trial_end_date
    notes: str | None = None


# ===== AI Assistant =====
class AssistantChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict] = []  # [{role:"user"|"assistant", content:str}]
    page_context: dict | None = None  # {route, plan, company, ...}


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
    media_url: str | None = None
    media_type: str | None = None  # image | document | audio | video


# ===== Campaigns =====
class CampaignVariant(BaseModel):
    name: str = Field(min_length=1, max_length=40)  # e.g. "Variant A"
    message: str = Field(min_length=1, max_length=4096)
    media_url: str | None = None
    media_type: str | None = None  # image | document | audio | video
    weight: int = Field(default=50, ge=1, le=99)  # % traffic, must total ≤100 across variants


class CampaignIn(BaseModel):
    name: str
    credential_id: str
    message: str = ""  # optional; can be supplied via template_id or A/B variants
    recipients: list[str]  # list of phone numbers in E.164 format
    schedule_at: datetime | None = None
    media_url: str | None = None
    media_type: str | None = None
    template_id: str | None = None  # optional saved-template lineage
    variants: list[CampaignVariant] = []  # optional A/B test; if empty → single message


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
    media_url: str | None = None
    media_type: str | None = None  # image | document | audio | video


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


# ===== Team / Invites =====
class InviteIn(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role: str = "member"  # admin | member | viewer


class AcceptInviteIn(BaseModel):
    token: str
    password: str = Field(min_length=6)
    full_name: str | None = None
