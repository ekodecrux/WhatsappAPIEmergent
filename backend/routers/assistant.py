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
    "/app/integrations": "ERP & API gives you API keys to send WhatsApp messages from your CRM/ERP, plus outbound webhooks.",
    "/app/team": "Team invites users to your tenant and manages roles.",
    "/app/support": "Support is where you raise and track tickets with our team.",
}


SYS_PROMPT = """You are wabridge's in-app AI assistant. wabridge is a B2B WhatsApp marketing & chatbot SaaS.

You are speaking to a SaaS tenant user. Help them with:
- "How do I…" questions about wabridge features (campaigns, flows, chat, leads, billing, integrations).
- Drafting a campaign message, naming, or planning recipients.
- Designing a chatbot flow (you can request its creation).
- Sending a test WhatsApp message.
- If you cannot help, you may suggest creating a support ticket.

You MUST output a single JSON object — NO prose, NO markdown fences. Schema:
{
  "type": "text" | "action" | "ticket",
  "message": "<your reply, plain text, under 800 chars, no markdown, no emojis>",
  "action": {  // only when type=="action"
    "kind": "create_campaign" | "draft_flow" | "send_test_message" | "navigate" | "raise_ticket",
    "params": { ... }
  }
}

Action params:
- create_campaign: {name, message, recipients_hint}  (recipients_hint is a description; UI will let user pick the actual phones)
- draft_flow: {description, triggers}  (triggers is a list of keywords)
- send_test_message: {to_phone, text}  (E.164 phone with leading +)
- navigate: {to}  (e.g., "/app/flows")
- raise_ticket: {subject, description, priority}  (priority: low|normal|high|urgent)

Rules:
- If the user asks a "how do I" question, return type="text" with a direct answer.
- If the user asks you to DO something (draft a campaign, design a flow, send a test), return type="action" with a sensible params guess.
- If the question is outside scope, complaint, or ambiguous, return type="ticket" with a sensible subject/description (priority based on urgency).
- Never make up internal IDs. Never claim to have completed an action — the UI will execute it on user's confirmation.
- Use the page_context to tailor help: if user is on /app/flows and asks "how do I publish", answer specifically about publishing flows.
- Plain language, friendly but concise. No emojis. No markdown.
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
