"""AI flow scaffold generator using Groq."""
import json
import re
import os
from helpers import groq_chat


SYSTEM_PROMPT = """You are an expert WhatsApp chatbot designer. Output ONLY valid JSON, no prose, no markdown fences.

Given a user description and optional trigger keywords, design a small WhatsApp chatbot flow as a directed graph of nodes and edges.

Rules:
- Output 4-8 nodes. Always include exactly one node of type "start" and at least one "end" node.
- Allowed node types: "start", "send", "ask", "choice", "end".
- Each node needs: id (n1, n2, ...), type, position {x, y}, data {...type-specific fields}.
- "send" data: { message: "..." }
- "ask" data: { prompt: "...", variable: "snake_case_name" } — prompt must end with a question mark.
- "choice" data: { prompt: "...", options: ["Option A", "Option B"] } — 2 to 4 options, short labels.
- "end" data: { message: "..." }
- "start" data: { label: "Start" }.
- Use {{variable_name}} interpolation when referencing previously captured variables.
- For position, lay nodes out from left to right with x increments of 250 starting at x:50.
- For choice nodes, create one outgoing edge PER option, with edge.label EXACTLY equal to the option text.
- Edges shape: { id: "e1", source: "n1", target: "n2", label?: "optional" }.
- Plain language only. No emojis. No markdown. Keep messages under 200 chars.

Output schema (JSON):
{
  "name": "short name",
  "nodes": [{...}, ...],
  "edges": [{...}, ...]
}

Reply with the JSON object and nothing else."""


def _extract_json(text: str) -> dict | None:
    """Best-effort JSON extraction from a model response."""
    if not text:
        return None
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Strip code fences
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # Greedy first-{ to last-}
    s = text.find("{")
    e = text.rfind("}")
    if s != -1 and e != -1 and e > s:
        try:
            return json.loads(text[s:e + 1])
        except Exception:
            pass
    return None


def _validate_and_normalize(payload: dict) -> dict:
    """Validate the AI output and normalize node positions/ids."""
    if not isinstance(payload, dict):
        raise ValueError("AI returned non-dict")
    nodes = payload.get("nodes") or []
    edges = payload.get("edges") or []
    if not nodes:
        raise ValueError("No nodes in AI response")

    allowed_types = {"start", "send", "ask", "choice", "end"}
    cleaned_nodes = []
    seen_ids = set()
    has_start = False
    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            continue
        ntype = n.get("type", "send")
        if ntype not in allowed_types:
            ntype = "send"
        if ntype == "start":
            has_start = True
        nid = n.get("id") or f"n{i + 1}"
        if nid in seen_ids:
            nid = f"n{i + 1}_dup"
        seen_ids.add(nid)
        pos = n.get("position") or {"x": 50 + i * 260, "y": 100}
        if not isinstance(pos, dict) or "x" not in pos or "y" not in pos:
            pos = {"x": 50 + i * 260, "y": 100}
        data = n.get("data") or {}
        if not isinstance(data, dict):
            data = {}
        # Coerce options to list of strings
        if ntype == "choice":
            opts = data.get("options") or []
            data["options"] = [str(o)[:60] for o in opts][:4]
            if not data["options"]:
                data["options"] = ["Yes", "No"]
        cleaned_nodes.append({"id": nid, "type": ntype, "position": pos, "data": data})

    # If no start, prepend one
    if not has_start:
        cleaned_nodes.insert(0, {
            "id": "n_start",
            "type": "start",
            "position": {"x": 0, "y": 100},
            "data": {"label": "Start"},
        })

    valid_node_ids = {n["id"] for n in cleaned_nodes}
    cleaned_edges = []
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            continue
        src = e.get("source")
        tgt = e.get("target")
        if src not in valid_node_ids or tgt not in valid_node_ids:
            continue
        cleaned_edges.append({
            "id": e.get("id") or f"e{i + 1}",
            "source": src,
            "target": tgt,
            "label": e.get("label"),
        })

    # Auto-stitch start -> first non-start if no edge from start exists
    start_node = next((n for n in cleaned_nodes if n["type"] == "start"), None)
    if start_node and not any(e["source"] == start_node["id"] for e in cleaned_edges):
        first = next((n for n in cleaned_nodes if n["id"] != start_node["id"]), None)
        if first:
            cleaned_edges.insert(0, {"id": "e_auto_start", "source": start_node["id"], "target": first["id"]})

    return {
        "name": payload.get("name") or "AI-generated flow",
        "nodes": cleaned_nodes,
        "edges": cleaned_edges,
    }


def generate_scaffold(description: str, triggers: list[str] | None = None) -> dict:
    """Generate a flow scaffold using Groq. Raises ValueError on failure."""
    triggers = triggers or []
    user = (
        f"Description: {description}\n"
        f"Trigger keywords: {', '.join(triggers) if triggers else 'none provided'}\n\n"
        "Design the chatbot flow as JSON."
    )
    raw = groq_chat(SYSTEM_PROMPT, user, max_tokens=1200)
    payload = _extract_json(raw)
    if payload is None:
        raise ValueError(f"Could not parse AI output: {raw[:200]}")
    return _validate_and_normalize(payload)
