"""Onboarding helpers: status checklist + one-click starter pack seeder.

The goal is to compress the 7-step real-world launch checklist into ~5 minutes:
  1. User pastes Meta/Twilio credentials (only thing only they can do)
  2. Click "Add starter pack" → we seed 3 templates, 1 welcome flow, 4 quick replies
  3. We expose wa.me link + QR code so they can promote immediately
"""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from server import db
from models import uid, now
from helpers import get_current_user, audit_log

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# Pre-built templates — high-quality, conversion-friendly, ready to submit to Meta
STARTER_TEMPLATES = [
    {
        "name": "welcome_message",
        "category": "marketing",
        "language": "en",
        "body": "Hi {{1}} 👋 Welcome to {{2}}!\n\nThanks for reaching out. Our team is here to help — what can we do for you today?",
        "header": None,
        "footer": "Reply STOP to opt out",
        "button_text": "View website",
    },
    {
        "name": "order_confirmation",
        "category": "utility",
        "language": "en",
        "body": "Hi {{1}}, your order #{{2}} is confirmed!\n\nAmount: ₹{{3}}\nExpected delivery: {{4}}\n\nWe'll keep you posted.",
        "header": None,
        "footer": "Track via the link below",
        "button_text": "Track order",
    },
    {
        "name": "otp_verification",
        "category": "authentication",
        "language": "en",
        "body": "{{1}} is your verification code. It expires in 10 minutes.\n\nDo not share this code with anyone.",
        "header": None,
        "footer": "Sent securely",
        "button_text": None,
    },
]


# Pre-built quick replies for live agents
STARTER_QUICK_REPLIES = [
    {"shortcut": "thanks", "body": "Thanks for reaching out! How can I help you today?"},
    {"shortcut": "pricing", "body": "Here's our latest pricing — let me know if you have any questions!"},
    {"shortcut": "hours", "body": "We're available Mon–Sat, 9 AM – 7 PM IST. Outside these hours, we'll get back to you within 12 hrs."},
    {"shortcut": "human", "body": "Connecting you to a human agent — someone will reply within 5 minutes."},
]


# Pre-built welcome chatbot flow (lead capture — proven pattern)
STARTER_FLOW = {
    "name": "Welcome — Lead Capture",
    "description": "Greets new contacts and captures name + interest. Ready to publish.",
    "is_published": False,
    "trigger_keywords": ["hi", "hello", "hey", "start"],
    "nodes": [
        {
            "id": "n1", "type": "trigger", "position": {"x": 50, "y": 50},
            "data": {"label": "Trigger", "keywords": ["hi", "hello", "hey", "start"]},
        },
        {
            "id": "n2", "type": "message", "position": {"x": 50, "y": 200},
            "data": {"label": "Greeting", "body": "Hi there 👋 Welcome to {company}! What's your name?"},
        },
        {
            "id": "n3", "type": "input", "position": {"x": 50, "y": 350},
            "data": {"label": "Capture name", "variable": "name", "prompt": "Please type your name"},
        },
        {
            "id": "n4", "type": "message", "position": {"x": 50, "y": 500},
            "data": {"label": "Ask interest", "body": "Nice to meet you, {{name}}! What brings you here today?\n\n1️⃣ Pricing & demo\n2️⃣ Support\n3️⃣ Just exploring"},
        },
        {
            "id": "n5", "type": "input", "position": {"x": 50, "y": 650},
            "data": {"label": "Capture interest", "variable": "interest"},
        },
        {
            "id": "n6", "type": "handoff", "position": {"x": 50, "y": 800},
            "data": {"label": "Notify team", "tag": "lead", "create_lead": True},
        },
        {
            "id": "n7", "type": "message", "position": {"x": 50, "y": 950},
            "data": {"label": "Closing", "body": "Got it — a team member will reach out within 5 minutes. Talk soon, {{name}}!"},
        },
    ],
    "edges": [
        {"id": "e1", "source": "n1", "target": "n2"},
        {"id": "e2", "source": "n2", "target": "n3"},
        {"id": "e3", "source": "n3", "target": "n4"},
        {"id": "e4", "source": "n4", "target": "n5"},
        {"id": "e5", "source": "n5", "target": "n6"},
        {"id": "e6", "source": "n6", "target": "n7"},
    ],
}


@router.get("/status")
async def status(current=Depends(get_current_user)):
    """Return onboarding checklist with live completion state."""
    tid = current["tenant_id"]
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0}) or {}

    creds = await db.whatsapp_credentials.count_documents({"tenant_id": tid})
    templates = await db.templates.count_documents({"tenant_id": tid})
    flows = await db.flows.count_documents({"tenant_id": tid})
    quick = await db.quick_replies.count_documents({"tenant_id": tid})
    api_keys = await db.api_keys.count_documents({"tenant_id": tid, "is_active": True})
    webhooks = await db.erp_webhooks.count_documents({"tenant_id": tid, "is_active": True})
    wallet = float(tenant.get("wallet_balance_inr") or 0)
    has_messages_sent = await db.messages.count_documents({"tenant_id": tid, "direction": "outbound"})
    has_inbound = await db.messages.count_documents({"tenant_id": tid, "direction": "inbound"})

    steps = [
        {
            "id": "channel",
            "title": "Connect WhatsApp number",
            "description": "Paste your Meta Cloud or Twilio credentials — only you can do this part.",
            "done": creds > 0,
            "href": "/app/connect-whatsapp",
            "cta": "Connect",
            "blocking": True,
            "duration": "3 min",
        },
        {
            "id": "starter_pack",
            "title": "Add the starter pack",
            "description": "We'll create 3 ready-to-submit templates, a welcome chatbot, and 4 quick replies.",
            "done": templates >= 1 and flows >= 1 and quick >= 1,
            "action": "POST /api/onboarding/seed",
            "cta": "Add now",
            "duration": "5 sec",
        },
        {
            "id": "templates",
            "title": "Submit templates for approval",
            "description": "Meta reviews each template. Marketing 1–24 hrs, Utility/Auth under 1 hr.",
            "done": templates > 0,
            "href": "/app/templates",
            "cta": "Open templates",
            "duration": "2 min",
        },
        {
            "id": "wallet",
            "title": "Top up your wallet",
            "description": "Recommended ₹500 to test, ₹2,500 to launch. Auto-refunds on failed sends.",
            "done": wallet >= 100,
            "href": "/app/wallet",
            "cta": "Top up",
            "duration": "1 min",
            "current_value": f"₹{wallet:.2f}",
        },
        {
            "id": "share",
            "title": "Promote your number",
            "description": "Get a wa.me link + QR code to add to your website, email signature, business cards.",
            "done": has_inbound > 0,
            "href": "/app/whatsapp",
            "cta": "Get link & QR",
            "duration": "30 sec",
        },
        {
            "id": "publish_flow",
            "title": "Publish your welcome chatbot",
            "description": "After the starter pack adds it, just open the flow and click Publish.",
            "done": await db.flows.count_documents({"tenant_id": tid, "is_published": True}) > 0,
            "href": "/app/flows",
            "cta": "Open flows",
            "duration": "30 sec",
        },
        {
            "id": "first_send",
            "title": "Send your first campaign",
            "description": "Use a Utility template to message engaged users — runs in seconds.",
            "done": has_messages_sent > 0,
            "href": "/app/campaigns",
            "cta": "New campaign",
            "duration": "2 min",
        },
    ]
    completed = sum(1 for s in steps if s["done"])
    return {
        "completed": completed,
        "total": len(steps),
        "percent": round((completed / len(steps)) * 100),
        "next_step": next((s for s in steps if not s["done"]), None),
        "steps": steps,
        # Bonus: optional power-user steps
        "power_user": {
            "api_key": api_keys > 0,
            "webhook": webhooks > 0,
            "completed": api_keys > 0 and webhooks > 0,
        },
    }


@router.post("/seed")
async def seed_starter_pack(current=Depends(get_current_user)):
    """One-click: seed 3 templates, 1 welcome flow, 4 quick replies. Idempotent — skips existing."""
    tid = current["tenant_id"]
    created = {"templates": 0, "flow": 0, "quick_replies": 0}

    # Templates
    for tpl in STARTER_TEMPLATES:
        existing = await db.templates.find_one(
            {"tenant_id": tid, "name": tpl["name"]}, {"_id": 0},
        )
        if existing:
            continue
        doc = {
            "id": uid(),
            "tenant_id": tid,
            "name": tpl["name"],
            "category": tpl["category"],
            "language": tpl["language"],
            "body": tpl["body"],
            "header": tpl.get("header"),
            "footer": tpl.get("footer"),
            "button_text": tpl.get("button_text"),
            "status": "draft",  # user submits to Meta from /templates page
            "created_by": current["id"],
            "created_at": now().isoformat(),
        }
        await db.templates.insert_one(doc)
        created["templates"] += 1

    # Welcome flow
    existing_flow = await db.flows.find_one({"tenant_id": tid, "name": STARTER_FLOW["name"]}, {"_id": 0})
    if not existing_flow:
        flow_doc = {
            "id": uid(),
            "tenant_id": tid,
            "name": STARTER_FLOW["name"],
            "description": STARTER_FLOW["description"],
            "is_published": False,
            "trigger_keywords": STARTER_FLOW["trigger_keywords"],
            "nodes": STARTER_FLOW["nodes"],
            "edges": STARTER_FLOW["edges"],
            "created_by": current["id"],
            "created_at": now().isoformat(),
        }
        await db.flows.insert_one(flow_doc)
        created["flow"] = 1

    # Quick replies
    for qr in STARTER_QUICK_REPLIES:
        existing_qr = await db.quick_replies.find_one(
            {"tenant_id": tid, "shortcut": qr["shortcut"]}, {"_id": 0},
        )
        if existing_qr:
            continue
        await db.quick_replies.insert_one({
            "id": uid(),
            "tenant_id": tid,
            "shortcut": qr["shortcut"],
            "body": qr["body"],
            "category": "general",
            "use_count": 0,
            "created_by": current["id"],
            "created_at": now().isoformat(),
        })
        created["quick_replies"] += 1

    await audit_log(tid, current["id"], "seed_starter_pack", "onboarding", created)
    return {"success": True, **created}
