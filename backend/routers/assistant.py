"""AI Assistant — context-aware help + action proposals using Groq.

Returns either:
  - {type: "text", message: "..."}  — plain answer
  - {type: "action", action: {kind, params}, message: "..."}  — actionable suggestion
  - {type: "ticket", ticket_id, message}  — when the assistant cannot help and creates a support ticket

Supported action kinds:
  - "create_campaign"     params: {name, message, recipients[]}
  - "draft_flow"          params: {description, triggers[]}
  - "send_test_message"   params: {credential_id, to_phone, text}
  - "navigate"            params: {to: "/app/..."}
  - "raise_ticket"        params: {subject, description, priority}
"""
import json
import re
from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import AssistantChatIn, uid, now
from helpers import get_current_user, groq_chat, run_sync, audit_log


router = APIRouter(prefix="/assistant", tags=["assistant"])


PAGE_HELP = {
    "/app": "Overview shows your KPIs (messages sent, delivery rate, leads, conversations) plus 14-day timeseries and outbound status breakdown.",
    "/app/whatsapp": "WhatsApp Setup is where you connect Twilio Sandbox, your own Twilio account, or Meta Cloud API. Use Test send to verify a credential.",
    "/app/campaigns": "Campaigns let you bulk-send a templated message to a list of phones. Recipients must be opted-in for sandbox creds.",
    "/app/leads": "Leads is your CRM — import via CSV, qualify, change status, and add custom fields.",
    "/app/chat": "Live Chat is a 3-pane inbox showing real-time conversations with AI sentiment and reply suggestions.",
    "/app/auto-replies": "Auto-replies fire on inbound keywords or always — useful for greetings and out-of-hours messages.",
    "/app/flows": "Chatbot Flows is a visual drag-and-drop builder. Use 'Generate flow' for AI scaffolding, then publish + share via QR.",
    "/app/marketplace": "Marketplace is community-published chatbot flows. Clone any with one click.",
    "/app/templates": "Message templates store reusable WhatsApp message bodies, used in campaigns.",
    "/app/analytics": "Analytics shows funnel + source breakdown across leads, campaigns and conversations.",
    "/app/delivery": "Delivery Status is the per-message Twilio webhook tracker — see what was delivered, queued or failed.",
    "/app/billing": "Subscription is your Razorpay-powered plan upgrade flow.",
    "/app/wallet": "Wallet is where you top up credits and choose between 'Wallet' (we handle Meta) or 'BYOC' (you connect your own Meta WABA).",
    "/app/integrations": "ERP & API gives you API keys to send WhatsApp messages from your CRM/ERP, plus outbound webhooks.",
    "/app/team": "Team invites users to your tenant and manages roles.",
    "/app/support": "Support is where you raise and track tickets with our team.",
    "/app/admin": "Super Admin Console — manage every tenant, plans, subscriptions, and tickets across the platform.",
}


# Quick non-IT-friendly hints shown on first visit per page
PAGE_TIPS = {
    "/app": [
        "Press 'Ask AI' anytime — I can draft campaigns or flows for you",
        "Connect WhatsApp first → then create a campaign or flow",
    ],
    "/app/whatsapp": [
        "Pick 'Twilio Sandbox' for instant testing (no Meta account needed)",
        "Use the Test Send button to confirm a recipient receives messages",
    ],
    "/app/campaigns": [
        "Pick a template instead of typing the message every time",
        "Add A/B variants to test 2 messages on the same audience",
    ],
    "/app/flows": [
        "Click 'Generate flow' and tell me what your bot should do — I'll build it",
        "After publishing, share the QR code so customers can WhatsApp you",
    ],
    "/app/wallet": [
        "Top up ₹500 to send ~588 marketing messages",
        "Service messages (replies within 24h) are FREE — no wallet deduction",
    ],
    "/app/chat": [
        "Sentiment + AI reply suggestions appear on every inbound message",
        "Languages are auto-detected — your bot replies in the customer's language",
    ],
    "/app/leads": [
        "Upload a CSV to import 1000s of leads at once",
        "Score leads with the AI sentiment of their last message",
    ],
}


SYS_PROMPT = """You are wabridge's friendly in-app guide. wabridge is a B2B WhatsApp marketing & chatbot SaaS used by schools, clinics, retailers, real-estate firms, and small businesses (often non-technical owners).

Your tone: warm, simple, confident. NEVER use jargon. Pretend the user has never seen a WhatsApp API before.
Always answer in 1-3 short sentences. Then offer the next concrete action.

You can help with:
- "How do I…" guidance: walk users through the right page, in plain English (e.g., "Go to Campaigns → Click 'New campaign' → Pick a template").
- Drafting a campaign message, flow, or template (you can offer to DO it via an action button).
- Sending a test WhatsApp message.
- Recharging the wallet.
- Creating a support ticket if you can't help.

You MUST output a single JSON object — NO prose, NO markdown fences. Schema:
{
  "type": "text" | "action" | "ticket",
  "message": "<your reply, plain text, under 600 chars, no markdown, no emojis>",
  "action": {  // only when type=="action"
    "kind": "create_campaign" | "draft_flow" | "send_test_message" | "navigate" | "raise_ticket",
    "params": { ... }
  }
}

Action params:
- create_campaign: {name, message, recipients_hint}
- draft_flow: {description, triggers}
- send_test_message: {to_phone, text}
- navigate: {to}  (e.g., "/app/wallet", "/app/flows", "/app/whatsapp")
- raise_ticket: {subject, description, priority}

Rules:
- "How do I…" / "Where do I…" → type="text" + suggest navigate action when useful.
- "Help me draft / create / build / send / set up" → type="action" with concrete params (you fill in sensible defaults).
- "I'm stuck", "this is broken", or anything you genuinely can't help with → type="ticket".
- For non-IT users: always end with a suggested next step. Example: "Want me to draft this for you?" or "Tap the action button to do it now."
- If user asks billing/wallet/credit questions, navigate them to /app/wallet.
- If they ask about WhatsApp setup or sending, point them to /app/whatsapp.
- Use the page_context to tailor advice. The user may not know technical terms — translate "WABA" → "WhatsApp Business account", "credentials" → "WhatsApp connection", etc.
"""


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1 and e > s:
        try:
            return json.loads(text[s:e + 1])
        except Exception:
            pass
    return None


def _build_user_msg(payload: AssistantChatIn) -> str:
    ctx = payload.page_context or {}
    route = (ctx.get("route") or "/app").strip()
    plan = ctx.get("plan") or "trial"
    company = ctx.get("company") or ""
    page_hint = PAGE_HELP.get(route, "")
    history = "\n".join(
        f"{m.get('role', 'user')}: {str(m.get('content', ''))[:300]}"
        for m in (payload.history or [])[-6:]
    )
    return (
        f"User context: company={company}, plan={plan}, current page={route}.\n"
        f"Page hint: {page_hint}\n"
        f"Recent history:\n{history or '(none)'}\n\n"
        f"User message: {payload.message}\n\n"
        f"Respond with the JSON object only."
    )


@router.post("/chat")
async def assistant_chat(payload: AssistantChatIn, current=Depends(get_current_user)):
    user_msg = _build_user_msg(payload)
    try:
        raw = await run_sync(groq_chat, SYS_PROMPT, user_msg, 600)
    except Exception:
        raw = ""

    parsed = _extract_json(raw)
    if not isinstance(parsed, dict) or "type" not in parsed:
        # Fallback: plain text mirror
        return {
            "type": "text",
            "message": (
                "I'm having trouble right now. Try rephrasing, or open Support to create a ticket and our team will help."
            ),
            "raw_unavailable": True,
        }

    typ = parsed.get("type", "text")
    msg = (parsed.get("message") or "").strip()[:1500]

    # Auto-create the ticket on the user's behalf when type=="ticket"
    if typ == "ticket":
        action = parsed.get("action") or {}
        params = action.get("params") if isinstance(action, dict) else {}
        params = params or {}
        subject = (params.get("subject") or payload.message[:80]).strip()[:120]
        description = (params.get("description") or msg or payload.message).strip()[:4000]
        priority = params.get("priority") if params.get("priority") in ("low", "normal", "high", "urgent") else "normal"
        ticket_id = uid()
        await db.support_tickets.insert_one({
            "id": ticket_id,
            "tenant_id": current["tenant_id"],
            "user_id": current["id"],
            "user_email": current.get("email"),
            "user_name": current.get("full_name"),
            "subject": subject,
            "description": description,
            "priority": priority,
            "category": "general",
            "source": "chatbot",
            "status": "open",
            "replies": [],
            "assigned_to": None,
            "created_at": now().isoformat(),
            "updated_at": now().isoformat(),
        })
        await audit_log(current["tenant_id"], current["id"], "assistant_create_ticket", ticket_id, {"subject": subject[:60]})
        return {
            "type": "ticket",
            "ticket_id": ticket_id,
            "message": (
                f"I've raised support ticket #{ticket_id[:8]} ('{subject}') with priority '{priority}'. "
                f"You'll get an email when our team responds. View it on the Support page."
            ),
        }

    if typ == "action":
        action = parsed.get("action") or {}
        kind = action.get("kind")
        if kind not in ("create_campaign", "draft_flow", "send_test_message", "navigate", "raise_ticket"):
            return {"type": "text", "message": msg or "I'm not sure how to help with that yet."}
        return {
            "type": "action",
            "message": msg,
            "action": {"kind": kind, "params": action.get("params") or {}},
        }

    return {"type": "text", "message": msg or "How can I help?"}


@router.get("/tips")
async def get_tips(route: str = "/app", current=Depends(get_current_user)):
    """Return quick contextual tips for the current page (non-IT user friendly)."""
    return {
        "route": route,
        "tips": PAGE_TIPS.get(route, []),
        "summary": PAGE_HELP.get(route, ""),
    }
