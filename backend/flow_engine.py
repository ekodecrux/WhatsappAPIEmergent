"""WhatsApp chatbot flow runtime engine.

Each flow is a graph of nodes:
- send: emit a message and auto-advance to its single outgoing edge
- ask: emit a prompt, capture next inbound message into variables[var_name], then advance
- choice: emit prompt with options; match user reply to options -> follow that edge
- branch: switch on keyword/value (no prompt, just match against last inbound)
- api: HTTP call to ERP webhook url (best-effort, no result handling for MVP)
- end: terminate session

A session tracks: conversation_id, flow_id, current_node_id, variables, status.
"""
import os
import asyncio
from typing import Any
import httpx

from helpers import decrypt_text, send_whatsapp, send_whatsapp_billed, run_sync


def _node(flow: dict, node_id: str) -> dict | None:
    for n in flow.get("nodes", []):
        if n.get("id") == node_id:
            return n
    return None


def _edges_from(flow: dict, node_id: str) -> list[dict]:
    return [e for e in flow.get("edges", []) if e.get("source") == node_id]


def _next_node(flow: dict, node_id: str, label_match: str | None = None) -> str | None:
    """Pick next node. If label_match given, look for an edge with matching label/condition; else first edge."""
    edges = _edges_from(flow, node_id)
    if label_match:
        norm = label_match.strip().lower()
        for e in edges:
            cond = (e.get("data", {}) or {}).get("condition") or e.get("label") or ""
            if cond and cond.strip().lower() == norm:
                return e.get("target")
            keywords = (e.get("data", {}) or {}).get("keywords") or []
            for k in keywords:
                if k.lower() in norm:
                    return e.get("target")
        # fallback to default edge marked as 'else' or first
        for e in edges:
            cond = ((e.get("data", {}) or {}).get("condition") or e.get("label") or "").strip().lower()
            if cond in ("else", "default", "*"):
                return e.get("target")
    return edges[0]["target"] if edges else None


def _localized_data(flow: dict, conversation: dict, node: dict) -> dict:
    """Return node.data with translation applied if a matching translation exists for conversation's language."""
    data = node.get("data") or {}
    lang = (conversation or {}).get("preferred_language")
    if not lang:
        return data
    translations = (flow.get("translations") or {}).get(lang)
    if not translations:
        return data
    nid = node.get("id")
    out = dict(data)
    for field in ("message", "prompt", "label"):
        key = f"{nid}.{field}"
        if key in translations and isinstance(translations[key], str):
            out[field] = translations[key]
    opts = data.get("options")
    if isinstance(opts, list):
        new_opts = []
        for i, opt in enumerate(opts):
            key = f"{nid}.options.{i}"
            new_opts.append(translations[key] if key in translations and isinstance(translations[key], str) else opt)
        out["options"] = new_opts
    return out


def _interpolate(text: str, variables: dict) -> str:
    """Replace {{var}} with variable values."""
    if not text:
        return text
    out = text
    for k, v in (variables or {}).items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


def _eval_condition(left: str, op: str, right: str) -> bool:
    """Evaluate a condition. Tries numeric comparison first, falls back to string."""
    op = (op or "==").strip()
    # numeric coercion
    try:
        ln, rn = float(left), float(right)
        if op == "==": return ln == rn
        if op == "!=": return ln != rn
        if op == ">": return ln > rn
        if op == "<": return ln < rn
        if op == ">=": return ln >= rn
        if op == "<=": return ln <= rn
    except (ValueError, TypeError):
        pass
    ls = str(left or "").lower()
    rs = str(right or "").lower()
    if op == "==": return ls == rs
    if op == "!=": return ls != rs
    if op == "contains": return rs in ls
    if op == "starts_with": return ls.startswith(rs)
    if op == "ends_with": return ls.endswith(rs)
    return False


async def _send(db, flow: dict, conversation: dict, content: str):
    """Send a message via the flow's credential and persist."""
    from datetime import datetime, timezone
    import secrets
    cred = await db.whatsapp_credentials.find_one({"id": flow["credential_id"]}, {"_id": 0})
    if not cred:
        return
    result = await send_whatsapp_billed(
        db, conversation["tenant_id"], cred, conversation["customer_phone"], content,
        category="service", note=f"Flow: {flow.get('name', '')[:40]}",
    )
    msg_doc = {
        "id": secrets.token_hex(8),
        "conversation_id": conversation["id"],
        "tenant_id": flow["tenant_id"],
        "direction": "outbound",
        "content": content,
        "status": "sent" if result.get("success") else "failed",
        "flow_id": flow["id"],
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    await db.conversations.update_one(
        {"id": conversation["id"]},
        {"$set": {"last_message": content, "last_message_at": datetime.now(timezone.utc).isoformat()}},
    )
    try:
        from ws_manager import ws_manager
        await ws_manager.broadcast(flow["tenant_id"], {"type": "message", "conversation_id": conversation["id"], "message": msg_doc})
    except Exception:
        pass


async def _step(db, flow: dict, conversation: dict, session: dict, inbound_text: str | None) -> dict:
    """Execute the current node; return updated session."""
    from datetime import datetime, timezone
    node = _node(flow, session["current_node_id"])
    if not node:
        session["status"] = "ended"
        return session
    ntype = node.get("type", "send")
    data = _localized_data(flow, conversation, node)

    # --- track node visit ---
    visits = session.setdefault("node_visits", {})
    visits[node["id"]] = visits.get(node["id"], 0) + 1

    # --- node behaviour ---
    if ntype == "start":
        # auto-advance
        nxt = _next_node(flow, node["id"])
        session["current_node_id"] = nxt
        if nxt:
            session = await _step(db, flow, conversation, session, inbound_text)
        else:
            session["status"] = "ended"
        return session

    if ntype == "send":
        text = _interpolate(data.get("message", ""), session.get("variables", {}))
        if text:
            await _send(db, flow, conversation, text)
        nxt = _next_node(flow, node["id"])
        session["current_node_id"] = nxt
        if nxt:
            # auto-advance synchronously if next is also non-blocking
            next_node = _node(flow, nxt)
            if next_node and next_node.get("type") in ("send", "branch", "start", "end"):
                session = await _step(db, flow, conversation, session, None)
        else:
            session["status"] = "ended"
        return session

    if ntype == "ask":
        if inbound_text is None:
            # First arrival on this node → emit prompt and wait
            prompt = _interpolate(data.get("prompt", "Please reply:"), session.get("variables", {}))
            await _send(db, flow, conversation, prompt)
            session["status"] = "waiting"
            return session
        # We have inbound → capture and advance
        var_name = data.get("variable") or "answer"
        session.setdefault("variables", {})[var_name] = inbound_text.strip()
        nxt = _next_node(flow, node["id"])
        session["current_node_id"] = nxt
        session["status"] = "running"
        if nxt:
            session = await _step(db, flow, conversation, session, None)
        else:
            session["status"] = "ended"
        return session

    if ntype == "choice":
        if inbound_text is None:
            options = data.get("options", [])
            opts_text = "\n".join([f"{i+1}. {o}" for i, o in enumerate(options)])
            prompt = _interpolate(data.get("prompt", "Pick one:"), session.get("variables", {}))
            await _send(db, flow, conversation, f"{prompt}\n{opts_text}")
            session["status"] = "waiting"
            return session
        # match inbound to option (localized first, then English fallback)
        original_options = (node.get("data") or {}).get("options") or []
        localized_options = data.get("options", []) or []
        nxt = _next_node(flow, node["id"], label_match=inbound_text)
        if not nxt:
            # try matching localized option text → map back to original to find edge
            inb_low = (inbound_text or "").strip().lower()
            for i, lopt in enumerate(localized_options):
                if str(lopt).strip().lower() == inb_low and i < len(original_options):
                    nxt = _next_node(flow, node["id"], label_match=original_options[i])
                    if nxt:
                        break
        # also try matching by index
        if not nxt:
            try:
                idx = int(inbound_text.strip()) - 1
                if 0 <= idx < len(original_options):
                    nxt = _next_node(flow, node["id"], label_match=original_options[idx])
            except Exception:
                pass
        if not nxt:
            # fallback: re-prompt
            await _send(db, flow, conversation, "I didn't catch that. Please pick one of the options.")
            session["status"] = "waiting"
            return session
        session["current_node_id"] = nxt
        session["status"] = "running"
        session = await _step(db, flow, conversation, session, None)
        return session

    if ntype == "branch":
        match = inbound_text or ""
        nxt = _next_node(flow, node["id"], label_match=match)
        session["current_node_id"] = nxt
        if nxt:
            session = await _step(db, flow, conversation, session, None)
        else:
            session["status"] = "ended"
        return session

    if ntype == "condition":
        # Evaluate condition: {variable}|{op}|{value}; route by 'true'/'false' edge label
        var_name = data.get("variable", "")
        op = data.get("operator", "==")
        compare_to = _interpolate(str(data.get("value", "")), session.get("variables", {}))
        actual = str((session.get("variables") or {}).get(var_name, ""))
        result = _eval_condition(actual, op, compare_to)
        nxt = _next_node(flow, node["id"], label_match="true" if result else "false")
        # Fallback to first/second edge if no label match
        if not nxt:
            edges = _edges_from(flow, node["id"])
            if edges:
                nxt = edges[0]["target"] if result else (edges[1]["target"] if len(edges) > 1 else edges[0]["target"])
        session["current_node_id"] = nxt
        if nxt:
            session = await _step(db, flow, conversation, session, None)
        else:
            session["status"] = "ended"
        return session

    if ntype == "api":
        url = data.get("url")
        if url:
            try:
                payload = {"variables": session.get("variables", {}), "phone": conversation["customer_phone"]}
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(url, json=payload)
            except Exception:
                pass
        nxt = _next_node(flow, node["id"])
        session["current_node_id"] = nxt
        if nxt:
            session = await _step(db, flow, conversation, session, None)
        else:
            session["status"] = "ended"
        return session

    if ntype == "end":
        text = _interpolate(data.get("message", ""), session.get("variables", {}))
        if text:
            await _send(db, flow, conversation, text)
        session["status"] = "ended"
        return session

    # unknown type → end
    session["status"] = "ended"
    return session


async def trigger_or_continue(db, tenant_id: str, conversation: dict, inbound_text: str) -> bool:
    """Called from inbound webhook/simulate. Returns True if a flow handled the message."""
    from datetime import datetime, timezone
    # 1. Active session?
    session = await db.flow_sessions.find_one(
        {"conversation_id": conversation["id"], "status": {"$in": ["running", "waiting"]}},
        {"_id": 0},
    )
    if session:
        flow = await db.flows.find_one({"id": session["flow_id"]}, {"_id": 0})
        if not flow or flow.get("status") != "active":
            await db.flow_sessions.update_one({"conversation_id": conversation["id"]}, {"$set": {"status": "ended"}})
            return False
        session = await _step(db, flow, conversation, session, inbound_text)
        session["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.flow_sessions.update_one(
            {"conversation_id": conversation["id"]},
            {"$set": {k: v for k, v in session.items() if k != "_id"}},
            upsert=True,
        )
        return True

    # 2. No session — match against active flow triggers
    flows = await db.flows.find({"tenant_id": tenant_id, "status": "active"}, {"_id": 0}).to_list(50)
    text_low = inbound_text.lower()
    matched = None
    for f in flows:
        triggers = f.get("triggers", []) or []
        for t in triggers:
            ttype = t.get("type", "keyword")
            if ttype == "always":
                matched = f
                break
            if ttype == "keyword":
                kws = [k.lower() for k in (t.get("keywords") or [])]
                if any(k in text_low for k in kws):
                    matched = f
                    break
        if matched:
            break

    if not matched:
        return False

    # Start session
    start_id = matched.get("start_node_id")
    if not start_id:
        # find first node of type 'start' or first node
        start_nodes = [n for n in matched.get("nodes", []) if n.get("type") == "start"]
        if start_nodes:
            start_id = start_nodes[0]["id"]
        elif matched.get("nodes"):
            start_id = matched["nodes"][0]["id"]
    if not start_id:
        return False

    session = {
        "id": __import__("secrets").token_hex(8),
        "tenant_id": tenant_id,
        "conversation_id": conversation["id"],
        "flow_id": matched["id"],
        "current_node_id": start_id,
        "variables": {"_inbound": inbound_text},
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    session = await _step(db, matched, conversation, session, None)
    await db.flow_sessions.insert_one({**session})
    return True
