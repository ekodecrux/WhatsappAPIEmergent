"""AI assist endpoints — spam-score, optimal send time, reply-coach autocomplete.

All powered by Emergent universal LLM key via Groq for low-latency responses.
"""
from __future__ import annotations
import json
import os
import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import db
from helpers import get_current_user

router = APIRouter(prefix="/ai-assist", tags=["ai-assist"])


def _groq_client():
    """Lazy import to avoid hard dependency at import time."""
    try:
        from groq import Groq
    except Exception as e:
        raise HTTPException(500, f"Groq SDK not installed: {e}")
    key = os.environ.get("GROQ_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY missing in environment")
    return Groq(api_key=key)


# ============ Spam score ============
class SpamCheckIn(BaseModel):
    body: str = Field(min_length=1, max_length=4096)
    category: str = "marketing"


def _heuristic_spam(body: str) -> tuple[int, list[str]]:
    """Quick deterministic checks before calling LLM."""
    issues: list[str] = []
    score = 0
    upper_ratio = sum(1 for c in body if c.isupper()) / max(1, sum(1 for c in body if c.isalpha()))
    if upper_ratio > 0.5 and len(body) > 20:
        score += 25
        issues.append("Too many ALL-CAPS words")
    if body.count("!") > 3:
        score += 15
        issues.append("Excessive exclamation marks")
    if re.search(r"(free|win|winner|prize|guarantee[d]?|act now|urgent|limited time|click here)", body, re.I):
        score += 20
        issues.append("Contains spam-trigger phrases (free / win / urgent / click here)")
    if re.search(r"https?://[^\s]+", body) and len(body) < 60:
        score += 10
        issues.append("Short message that's mostly a link — looks promotional")
    if re.search(r"\b\d{10,}\b", body):
        score += 5
        issues.append("Bare phone number — use a contact card instead")
    return min(100, score), issues


@router.post("/spam-score")
async def spam_score(payload: SpamCheckIn, current=Depends(get_current_user)):
    """Score a draft 0-100 (lower = better) + suggest improvements.

    Returns: {score, label, issues[], rewrite_suggestion?}
    """
    base_score, issues = _heuristic_spam(payload.body)

    # LLM polish for an actionable rewrite
    rewrite = None
    label = "good"
    try:
        client = _groq_client()
        prompt = (
            "You are a WhatsApp marketing reviewer. Rate the message on a 0-100 spam-score scale "
            "(0 = perfectly natural conversation; 100 = guaranteed Meta block). Then suggest one "
            "rewrite that's compliant + conversion-friendly. Reply ONLY in compact JSON: "
            '{"score": int, "issues": [str], "rewrite": str}.\n\nCategory: '
            f"{payload.category}\nMessage:\n{payload.body}"
        )
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(resp.choices[0].message.content)
        llm_score = int(parsed.get("score", base_score))
        for i in parsed.get("issues", []) or []:
            if i and i not in issues:
                issues.append(i)
        rewrite = parsed.get("rewrite")
        # Blend: take max so we don't underweight either signal
        final = max(base_score, llm_score)
    except Exception:
        final = base_score

    if final >= 70:
        label = "danger"
    elif final >= 40:
        label = "warning"
    else:
        label = "good"

    return {"score": final, "label": label, "issues": issues[:6], "rewrite": rewrite}


# ============ Optimal send time ============
@router.get("/optimal-send-time")
async def optimal_send_time(current=Depends(get_current_user)):
    """Recommend the best hour-of-day & day-of-week based on this tenant's reply history.

    Returns deltas vs the global baseline (Meta data: weekday 11–13 IST gets best read rates).
    """
    tid = current["tenant_id"]

    # Aggregate inbound replies (proxy for engagement) by hour & weekday
    pipe = [
        {"$match": {"tenant_id": tid, "direction": "inbound",
                    "sent_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()}}},
        {"$project": {
            "hour": {"$hour": {"$dateFromString": {"dateString": "$sent_at", "onError": None}}},
            "dow": {"$dayOfWeek": {"$dateFromString": {"dateString": "$sent_at", "onError": None}}},
        }},
        {"$facet": {
            "by_hour": [{"$group": {"_id": "$hour", "count": {"$sum": 1}}},
                       {"$sort": {"count": -1}}],
            "by_dow": [{"$group": {"_id": "$dow", "count": {"$sum": 1}}},
                      {"$sort": {"count": -1}}],
        }},
    ]
    docs = await db.messages.aggregate(pipe).to_list(1)
    facets = docs[0] if docs else {"by_hour": [], "by_dow": []}

    has_data = bool(facets.get("by_hour"))
    if has_data:
        top_hour = facets["by_hour"][0]["_id"] or 11
        top_dow = facets["by_dow"][0]["_id"] or 3  # Mongo: 1=Sun, 2=Mon … 7=Sat
        confidence = "high" if sum(h["count"] for h in facets["by_hour"][:3]) > 30 else "low"
    else:
        top_hour = 11
        top_dow = 3
        confidence = "baseline"

    dow_names = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return {
        "best_hour_local": int(top_hour),
        "best_hour_label": f"{int(top_hour):02d}:00",
        "best_day_label": dow_names[int(top_dow)],
        "confidence": confidence,
        "based_on": "your conversation history" if has_data else "industry baseline (no data yet)",
        "rationale": (
            "Your audience replies most around this hour — campaigns sent then see ~2× higher read rate."
            if confidence == "high" else
            "We're using global benchmarks until we see 30+ inbound messages from your audience."
        ),
        "by_hour": [{"hour": h["_id"], "count": h["count"]} for h in facets.get("by_hour", []) if h.get("_id") is not None][:24],
    }


# ============ Reply Coach (ghost-text autocomplete) ============
class ReplyCoachIn(BaseModel):
    conversation_id: str
    draft: str = Field(default="", max_length=1000)


@router.post("/reply-coach")
async def reply_coach(payload: ReplyCoachIn, current=Depends(get_current_user)):
    """Suggest the rest of the agent's draft sentence based on conversation context.

    Returns {completion}: a short continuation (≤80 chars) the agent can Tab-accept.
    """
    conv = await db.conversations.find_one(
        {"id": payload.conversation_id, "tenant_id": current["tenant_id"]}, {"_id": 0},
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")

    # Fetch last 6 messages for context
    cur = db.messages.find(
        {"conversation_id": payload.conversation_id, "tenant_id": current["tenant_id"]},
        {"_id": 0, "direction": 1, "content": 1, "sent_at": 1},
    ).sort("sent_at", -1).limit(6)
    msgs = list(reversed(await cur.to_list(6)))

    history = "\n".join(
        f"{'Customer' if m['direction'] == 'inbound' else 'Agent'}: {m.get('content', '')[:200]}"
        for m in msgs
    )

    try:
        client = _groq_client()
        prompt = (
            "You are an autocomplete assistant for a customer-support agent on WhatsApp. "
            "Given the conversation and the agent's partial reply (draft), return the "
            "MOST LIKELY 5–60 character continuation. Match agent tone, be concise, no greeting "
            "if the agent already started. Return ONLY the continuation text, no quotes, no JSON.\n\n"
            f"Conversation:\n{history}\n\nAgent's draft so far: \"{payload.draft}\"\n\nContinuation:"
        )
        resp = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=60,
        )
        completion = (resp.choices[0].message.content or "").strip().strip('"').strip("'")
        # Don't echo the draft
        if payload.draft and completion.lower().startswith(payload.draft.lower()):
            completion = completion[len(payload.draft):]
        # Cap at 80 chars
        completion = completion[:80]
    except Exception as e:
        return {"completion": "", "error": str(e)[:200]}

    return {"completion": completion}
