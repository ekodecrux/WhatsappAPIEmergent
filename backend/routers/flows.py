"""Flow / chatbot designer routes."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from server import db
from models import uid, now
from helpers import get_current_user, audit_log, run_sync
from flow_engine import trigger_or_continue
from flow_ai import generate_scaffold
from flow_translate import (
    translate_flow_strings,
    collect_translatable,
    LANG_NAMES,
)


router = APIRouter(prefix="/flows", tags=["flows"])


# ============ Templates ============
TEMPLATES = {
    "blank": {
        "name": "Blank flow",
        "description": "Start from scratch.",
        "category": "Custom",
        "nodes": [
            {"id": "n1", "type": "start", "position": {"x": 100, "y": 100}, "data": {"label": "Start"}},
        ],
        "edges": [],
        "triggers": [{"type": "keyword", "keywords": ["start"]}],
    },
    "banking": {
        "name": "Mobile Banking Bot",
        "description": "Account balance, recent transactions, fund transfer menu.",
        "category": "Banking",
        "triggers": [{"type": "keyword", "keywords": ["bank", "account", "balance", "hi"]}],
        "nodes": [
            {"id": "n1", "type": "start", "position": {"x": 50, "y": 100}, "data": {"label": "Start"}},
            {"id": "n2", "type": "ask", "position": {"x": 250, "y": 100}, "data": {"prompt": "Welcome to SecureBank. To verify, please share your registered mobile number (last 4 digits).", "variable": "phone_last4"}},
            {"id": "n3", "type": "choice", "position": {"x": 500, "y": 100}, "data": {"prompt": "Hi {{phone_last4}}, what would you like to do today?", "options": ["Check balance", "Last 5 transactions", "Transfer funds", "Talk to agent"]}},
            {"id": "n4", "type": "send", "position": {"x": 750, "y": 0}, "data": {"message": "Your current balance is ₹84,532.67 (as of today)."}},
            {"id": "n5", "type": "send", "position": {"x": 750, "y": 100}, "data": {"message": "Last 5: \n1. Amazon — ₹2,340 \n2. Salary — +₹1,20,000 \n3. Swiggy — ₹520 \n4. Electricity — ₹2,100 \n5. ATM — ₹5,000"}},
            {"id": "n6", "type": "ask", "position": {"x": 750, "y": 200}, "data": {"prompt": "Enter beneficiary mobile number to transfer funds:", "variable": "beneficiary"}},
            {"id": "n7", "type": "ask", "position": {"x": 1000, "y": 200}, "data": {"prompt": "Amount in INR?", "variable": "amount"}},
            {"id": "n8", "type": "send", "position": {"x": 1250, "y": 200}, "data": {"message": "₹{{amount}} sent to {{beneficiary}}. Reference: TXN-{{phone_last4}}-OK"}},
            {"id": "n9", "type": "end", "position": {"x": 750, "y": 320}, "data": {"message": "Connecting you to a human agent. Please hold."}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n4", "label": "Check balance"},
            {"id": "e4", "source": "n3", "target": "n5", "label": "Last 5 transactions"},
            {"id": "e5", "source": "n3", "target": "n6", "label": "Transfer funds"},
            {"id": "e6", "source": "n3", "target": "n9", "label": "Talk to agent"},
            {"id": "e7", "source": "n6", "target": "n7"},
            {"id": "e8", "source": "n7", "target": "n8"},
        ],
    },
    "training": {
        "name": "Training Certification",
        "description": "Quiz-based training with completion certificate.",
        "category": "Education",
        "triggers": [{"type": "keyword", "keywords": ["train", "course", "certificate"]}],
        "nodes": [
            {"id": "n1", "type": "start", "position": {"x": 50, "y": 100}, "data": {"label": "Start"}},
            {"id": "n2", "type": "ask", "position": {"x": 250, "y": 100}, "data": {"prompt": "Welcome to the WhatsApp Marketing Mastery course. What's your full name?", "variable": "name"}},
            {"id": "n3", "type": "send", "position": {"x": 500, "y": 100}, "data": {"message": "Hi {{name}}! Let's get started with a 3-question quiz."}},
            {"id": "n4", "type": "choice", "position": {"x": 750, "y": 100}, "data": {"prompt": "Q1: What is the WhatsApp Business API rate limit per second?", "options": ["80 msg/s", "10 msg/s", "1000 msg/s"]}},
            {"id": "n5", "type": "choice", "position": {"x": 1000, "y": 100}, "data": {"prompt": "Q2: Which message type requires opt-in?", "options": ["Marketing", "Authentication", "Service"]}},
            {"id": "n6", "type": "choice", "position": {"x": 1250, "y": 100}, "data": {"prompt": "Q3: AES-256 stands for?", "options": ["Encryption standard", "API protocol", "WhatsApp tier"]}},
            {"id": "n7", "type": "end", "position": {"x": 1500, "y": 100}, "data": {"message": "🎓 Congrats {{name}}! You've completed the course. Certificate ID: WMM-{{name}}-2026. We'll email a PDF copy."}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n4"},
            {"id": "e4", "source": "n4", "target": "n5", "label": "80 msg/s"},
            {"id": "e5", "source": "n4", "target": "n5", "label": "10 msg/s"},
            {"id": "e6", "source": "n4", "target": "n5", "label": "1000 msg/s"},
            {"id": "e7", "source": "n5", "target": "n6", "label": "Marketing"},
            {"id": "e8", "source": "n5", "target": "n6", "label": "Authentication"},
            {"id": "e9", "source": "n5", "target": "n6", "label": "Service"},
            {"id": "e10", "source": "n6", "target": "n7"},
        ],
    },
    "lead_qualifier": {
        "name": "Lead Qualifier",
        "description": "Capture name, company, budget — qualify automatically.",
        "category": "Sales",
        "triggers": [{"type": "keyword", "keywords": ["pricing", "demo", "interested"]}],
        "nodes": [
            {"id": "n1", "type": "start", "position": {"x": 50, "y": 100}, "data": {"label": "Start"}},
            {"id": "n2", "type": "ask", "position": {"x": 250, "y": 100}, "data": {"prompt": "Thanks for your interest! Can I get your full name?", "variable": "name"}},
            {"id": "n3", "type": "ask", "position": {"x": 500, "y": 100}, "data": {"prompt": "Hi {{name}}! Which company are you with?", "variable": "company"}},
            {"id": "n4", "type": "choice", "position": {"x": 750, "y": 100}, "data": {"prompt": "Approx team size at {{company}}?", "options": ["1-10", "11-50", "51-200", "200+"]}},
            {"id": "n5", "type": "end", "position": {"x": 1000, "y": 100}, "data": {"message": "Thanks {{name}}! Our enterprise team will reach out to you within 1 business hour."}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n4"},
            {"id": "e4", "source": "n4", "target": "n5"},
        ],
    },
    "support_faq": {
        "name": "Support FAQ Bot",
        "description": "Routes common support questions to canned answers.",
        "category": "Support",
        "triggers": [{"type": "keyword", "keywords": ["help", "support", "issue"]}],
        "nodes": [
            {"id": "n1", "type": "start", "position": {"x": 50, "y": 100}, "data": {"label": "Start"}},
            {"id": "n2", "type": "choice", "position": {"x": 250, "y": 100}, "data": {"prompt": "Hi! How can we help?", "options": ["Reset password", "Billing question", "Talk to agent"]}},
            {"id": "n3", "type": "send", "position": {"x": 500, "y": 0}, "data": {"message": "Reset link: https://app.example.com/reset — link valid for 30 minutes."}},
            {"id": "n4", "type": "send", "position": {"x": 500, "y": 100}, "data": {"message": "Visit your billing portal: https://app.example.com/billing"}},
            {"id": "n5", "type": "end", "position": {"x": 500, "y": 200}, "data": {"message": "Connecting you to a human agent."}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3", "label": "Reset password"},
            {"id": "e3", "source": "n2", "target": "n4", "label": "Billing question"},
            {"id": "e4", "source": "n2", "target": "n5", "label": "Talk to agent"},
        ],
    },
}


@router.get("/templates")
async def list_templates(current=Depends(get_current_user)):
    return [
        {"id": k, "name": v["name"], "description": v["description"], "category": v["category"]}
        for k, v in TEMPLATES.items()
    ]


# ============ AI scaffold ============
@router.post("/ai-scaffold")
async def ai_scaffold(body: dict, current=Depends(get_current_user)):
    """Generate a flow scaffold from a natural language description.

    Body: { description: str, triggers?: list[str] }
    Returns: { name, nodes, edges } in our flow schema (not persisted).
    """
    desc = (body.get("description") or "").strip()
    if not desc or len(desc) < 4:
        raise HTTPException(400, "Description is too short")
    triggers = body.get("triggers") or []
    try:
        scaffold = await run_sync(generate_scaffold, desc, triggers)
    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {e}")
    await audit_log(current["tenant_id"], current["id"], "ai_scaffold_generate", "", {"description": desc[:120]})
    return scaffold


@router.post("/{fid}/ai-scaffold")
async def ai_scaffold_apply(fid: str, body: dict, current=Depends(get_current_user)):
    """Generate AND apply scaffold to an existing draft flow.

    Body: { description: str, triggers?: list[str], replace?: bool }
    """
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    if f.get("status") == "active":
        raise HTTPException(400, "Unpublish before generating a new scaffold")

    desc = (body.get("description") or "").strip()
    if not desc or len(desc) < 4:
        raise HTTPException(400, "Description is too short")
    triggers = body.get("triggers") or (f.get("triggers", [{}])[0].get("keywords") if f.get("triggers") else [])

    try:
        scaffold = await run_sync(generate_scaffold, desc, triggers)
    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {e}")

    start = next((n for n in scaffold["nodes"] if n["type"] == "start"), scaffold["nodes"][0])
    update = {
        "name": scaffold.get("name") or f["name"],
        "nodes": scaffold["nodes"],
        "edges": scaffold["edges"],
        "start_node_id": start["id"],
        "updated_at": now().isoformat(),
    }
    await db.flows.update_one({"id": fid}, {"$set": update})
    await audit_log(current["tenant_id"], current["id"], "ai_scaffold_apply", fid, {"description": desc[:120]})
    return {"applied": True, **update}


@router.post("/from-template/{template_id}")
async def from_template(template_id: str, body: dict | None = None, current=Depends(get_current_user)):
    tpl = TEMPLATES.get(template_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    body = body or {}
    fid = uid()
    # set start node id
    nodes = tpl.get("nodes", [])
    start = next((n for n in nodes if n.get("type") == "start"), nodes[0] if nodes else None)
    flow = {
        "id": fid,
        "tenant_id": current["tenant_id"],
        "name": body.get("name") or tpl["name"],
        "description": tpl["description"],
        "credential_id": body.get("credential_id"),
        "status": "draft",
        "triggers": tpl.get("triggers", []),
        "nodes": nodes,
        "edges": tpl.get("edges", []),
        "start_node_id": start.get("id") if start else None,
        "created_by": current["id"],
        "created_at": now().isoformat(),
        "updated_at": now().isoformat(),
    }
    await db.flows.insert_one({**flow})
    flow.pop("_id", None)
    await audit_log(current["tenant_id"], current["id"], "create_flow", fid, {"template": template_id})
    return flow


# ============ CRUD ============
@router.post("")
async def create_flow(body: dict, current=Depends(get_current_user)):
    fid = uid()
    flow = {
        "id": fid,
        "tenant_id": current["tenant_id"],
        "name": body.get("name", "Untitled flow"),
        "description": body.get("description", ""),
        "credential_id": body.get("credential_id"),
        "status": "draft",
        "triggers": body.get("triggers", [{"type": "keyword", "keywords": ["start"]}]),
        "nodes": body.get("nodes", []),
        "edges": body.get("edges", []),
        "start_node_id": body.get("start_node_id"),
        "created_by": current["id"],
        "created_at": now().isoformat(),
        "updated_at": now().isoformat(),
    }
    await db.flows.insert_one({**flow})
    flow.pop("_id", None)
    return flow


@router.get("")
async def list_flows(current=Depends(get_current_user)):
    cur = db.flows.find({"tenant_id": current["tenant_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@router.get("/_languages")
async def supported_languages(current=Depends(get_current_user)):
    """List all supported translation target languages."""
    return [{"code": k, "name": v} for k, v in LANG_NAMES.items()]


@router.get("/{fid}")
async def get_flow(fid: str, current=Depends(get_current_user)):
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    return f


@router.put("/{fid}")
async def update_flow(fid: str, body: dict, current=Depends(get_current_user)):
    allowed = {"name", "description", "credential_id", "triggers", "nodes", "edges", "start_node_id", "status"}
    upd = {k: v for k, v in body.items() if k in allowed}
    if not upd:
        return {"updated": 0}
    upd["updated_at"] = now().isoformat()
    res = await db.flows.update_one({"id": fid, "tenant_id": current["tenant_id"]}, {"$set": upd})
    return {"updated": res.modified_count}


@router.delete("/{fid}")
async def delete_flow(fid: str, current=Depends(get_current_user)):
    await db.flow_sessions.delete_many({"flow_id": fid, "tenant_id": current["tenant_id"]})
    res = await db.flows.delete_one({"id": fid, "tenant_id": current["tenant_id"]})
    return {"deleted": bool(res.deleted_count)}


@router.post("/{fid}/publish")
async def publish_flow(fid: str, current=Depends(get_current_user)):
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    if not f.get("credential_id"):
        raise HTTPException(400, "Connect a WhatsApp credential before publishing")
    if not f.get("nodes") or not f.get("start_node_id"):
        raise HTTPException(400, "Flow has no start node")
    await db.flows.update_one({"id": fid}, {"$set": {"status": "active", "updated_at": now().isoformat()}})
    await audit_log(current["tenant_id"], current["id"], "publish_flow", fid)
    return {"status": "active"}


@router.post("/{fid}/unpublish")
async def unpublish_flow(fid: str, current=Depends(get_current_user)):
    await db.flows.update_one({"id": fid, "tenant_id": current["tenant_id"]}, {"$set": {"status": "draft", "updated_at": now().isoformat()}})
    return {"status": "draft"}


# ============ Test runner ============
@router.post("/{fid}/test")
async def test_flow(fid: str, body: dict, current=Depends(get_current_user)):
    """Simulate triggering this flow on a test conversation. Body: {customer_phone, message}."""
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    if not f.get("credential_id"):
        raise HTTPException(400, "Connect a WhatsApp credential first")
    customer_phone = body.get("customer_phone") or "+919999000001"
    inbound = body.get("message") or "test"

    conv = await db.conversations.find_one(
        {"tenant_id": current["tenant_id"], "customer_phone": customer_phone},
        {"_id": 0},
    )
    if not conv:
        conv = {
            "id": uid(),
            "tenant_id": current["tenant_id"],
            "credential_id": f["credential_id"],
            "customer_phone": customer_phone,
            "customer_name": "Flow Tester",
            "status": "active",
            "unread_count": 0,
            "lead_score": 50,
            "last_message": inbound,
            "last_message_at": now().isoformat(),
            "created_at": now().isoformat(),
        }
        await db.conversations.insert_one(conv)

    # Persist inbound message
    await db.messages.insert_one({
        "id": uid(),
        "conversation_id": conv["id"],
        "tenant_id": current["tenant_id"],
        "direction": "inbound",
        "content": inbound,
        "status": "received",
        "sent_at": now().isoformat(),
    })

    # Force-trigger this flow if no session is active
    handled = await trigger_or_continue(db, current["tenant_id"], conv, inbound)
    if not handled:
        # No trigger matched — start session manually using flow's start node
        from flow_engine import _step
        start_id = f.get("start_node_id") or (f.get("nodes", [{}])[0].get("id") if f.get("nodes") else None)
        if start_id:
            session = {
                "id": uid(),
                "tenant_id": current["tenant_id"],
                "conversation_id": conv["id"],
                "flow_id": f["id"],
                "current_node_id": start_id,
                "variables": {"_inbound": inbound},
                "status": "running",
                "started_at": now().isoformat(),
                "updated_at": now().isoformat(),
            }
            session = await _step(db, f, conv, session, None)
            await db.flow_sessions.insert_one({**session})

    return {"ok": True, "conversation_id": conv["id"]}


# ============ Sessions ============
@router.get("/sessions/active")
async def list_sessions(current=Depends(get_current_user)):
    cur = db.flow_sessions.find(
        {"tenant_id": current["tenant_id"], "status": {"$in": ["running", "waiting"]}},
        {"_id": 0},
    ).sort("updated_at", -1)
    return await cur.to_list(100)


# ============ Analytics ============
@router.get("/{fid}/analytics")
async def flow_analytics(fid: str, current=Depends(get_current_user)):
    """Return per-node visit counts, total/active/completed sessions."""
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")

    sessions = await db.flow_sessions.find({"flow_id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0}).to_list(5000)
    total = len(sessions)
    completed = sum(1 for s in sessions if s.get("status") == "ended")
    active = sum(1 for s in sessions if s.get("status") in ("running", "waiting"))

    node_visits: dict[str, int] = {}
    for s in sessions:
        for nid, count in (s.get("node_visits") or {}).items():
            node_visits[nid] = node_visits.get(nid, 0) + count

    # Drop-off: visits at this node minus visits at any subsequent (next-edge) node
    nodes = f.get("nodes", [])
    edges = f.get("edges", [])
    node_stats = []
    for n in nodes:
        nid = n["id"]
        visits = node_visits.get(nid, 0)
        # sum of visits at all nodes this one points to
        downstream = sum(node_visits.get(e["target"], 0) for e in edges if e.get("source") == nid)
        drop = max(0, visits - downstream)
        drop_pct = round((drop / visits) * 100, 1) if visits else 0
        node_stats.append({
            "node_id": nid,
            "type": n.get("type"),
            "label": (n.get("data", {}) or {}).get("message") or (n.get("data", {}) or {}).get("prompt") or (n.get("data", {}) or {}).get("label") or n.get("type"),
            "visits": visits,
            "drop_off": drop,
            "drop_off_pct": drop_pct,
        })

    completion_rate = round((completed / total) * 100, 1) if total else 0
    return {
        "totals": {"sessions": total, "completed": completed, "active": active, "completion_rate": completion_rate},
        "node_stats": node_stats,
    }


# ============ QR code ============
@router.get("/{fid}/qr")
async def flow_qr(fid: str, current=Depends(get_current_user)):
    """Generate a wa.me QR code that auto-fills the trigger keyword on WhatsApp.

    Returns: { url, image_base64 } — image is a PNG.
    """
    import io, base64
    import qrcode

    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    if not f.get("credential_id"):
        raise HTTPException(400, "Connect a WhatsApp credential first")

    cred = await db.whatsapp_credentials.find_one({"id": f["credential_id"]}, {"_id": 0})
    if not cred:
        raise HTTPException(400, "Credential missing")

    # First trigger keyword (defaults to 'hi')
    triggers = f.get("triggers", []) or []
    keywords = (triggers[0].get("keywords") if triggers else []) or ["hi"]
    keyword = keywords[0]

    # Phone number: strip 'whatsapp:' prefix and '+'
    phone = (cred.get("whatsapp_from", "") or "").replace("whatsapp:", "").replace("+", "")
    if not phone:
        raise HTTPException(400, "Credential has no WhatsApp from-number")

    from urllib.parse import quote
    url = f"https://wa.me/{phone}?text={quote(keyword)}"

    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode()
    return {"url": url, "image_base64": image_b64, "keyword": keyword, "phone": phone}


# ============ Multilingual ============
@router.get("/{fid}/translations")
async def list_translations(fid: str, current=Depends(get_current_user)):
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    translations = f.get("translations") or {}
    return {
        "default_language": f.get("language") or "en",
        "available": [
            {"code": code, "name": LANG_NAMES.get(code, code), "string_count": len(t or {})}
            for code, t in translations.items()
        ],
    }


@router.post("/{fid}/translate")
async def translate_flow(fid: str, body: dict, current=Depends(get_current_user)):
    """Translate a flow into target_lang via Groq.

    Body: { target_lang: "es" }
    Stores translations[target_lang] as flat key dict.
    """
    target = (body.get("target_lang") or "").strip().lower()
    if target not in LANG_NAMES:
        raise HTTPException(400, "Unsupported target_lang")
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    if (f.get("language") or "en") == target:
        raise HTTPException(400, "Target language is same as flow's default language")

    strings = collect_translatable(f.get("nodes") or [])
    if not strings:
        raise HTTPException(400, "Flow has no text to translate")

    try:
        translated = await run_sync(translate_flow_strings, strings, target)
    except Exception as e:
        msg = str(e)
        if "429" in msg or "rate" in msg.lower() or "quota" in msg.lower():
            raise HTTPException(503, "Translation service is busy — try again in a moment")
        raise HTTPException(500, "Translation failed — please try again or contact support")

    translations = f.get("translations") or {}
    translations[target] = translated
    await db.flows.update_one(
        {"id": fid, "tenant_id": current["tenant_id"]},
        {"$set": {"translations": translations, "updated_at": now().isoformat()}},
    )
    await audit_log(current["tenant_id"], current["id"], "translate_flow", fid, {"lang": target, "strings": len(strings)})
    return {
        "language": target,
        "language_name": LANG_NAMES[target],
        "string_count": len(translated),
        "translations": translated,
    }


@router.delete("/{fid}/translations/{lang}")
async def delete_translation(fid: str, lang: str, current=Depends(get_current_user)):
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    translations = f.get("translations") or {}
    if lang not in translations:
        raise HTTPException(404, "Language not found")
    translations.pop(lang, None)
    await db.flows.update_one(
        {"id": fid, "tenant_id": current["tenant_id"]},
        {"$set": {"translations": translations, "updated_at": now().isoformat()}},
    )
    return {"deleted": True}


@router.put("/{fid}/translations/{lang}")
async def upsert_translation_strings(fid: str, lang: str, body: dict, current=Depends(get_current_user)):
    """Manual edit of translation strings.

    Body: { translations: { "n1.message": "Hola", ... } }
    """
    if lang not in LANG_NAMES:
        raise HTTPException(400, "Unsupported language")
    f = await db.flows.find_one({"id": fid, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Not found")
    incoming = body.get("translations") or {}
    if not isinstance(incoming, dict):
        raise HTTPException(400, "translations must be an object")
    translations = f.get("translations") or {}
    cur = translations.get(lang) or {}
    cur.update({str(k): str(v) for k, v in incoming.items() if isinstance(v, str)})
    translations[lang] = cur
    await db.flows.update_one(
        {"id": fid, "tenant_id": current["tenant_id"]},
        {"$set": {"translations": translations, "updated_at": now().isoformat()}},
    )
    return {"updated": len(incoming), "language": lang}
