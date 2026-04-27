"""Multilingual flow translation using Groq."""
import json
import re
from helpers import groq_chat


LANG_NAMES = {
    "en": "English",
    "es": "Spanish",
    "hi": "Hindi",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese",
    "ar": "Arabic",
    "id": "Indonesian",
    "vi": "Vietnamese",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "ko": "Korean",
    "ru": "Russian",
    "tr": "Turkish",
    "it": "Italian",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "bn": "Bengali",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
}


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


def translate_flow_strings(strings: dict, target_lang: str) -> dict:
    """Translate a dict of {key: english_text} into target_lang.

    Preserves {{variable}} placeholders verbatim.
    """
    target_name = LANG_NAMES.get(target_lang, target_lang)
    if not strings:
        return {}
    sys_prompt = (
        f"You are a professional translator. Translate the values of this JSON object from English into {target_name}. "
        "Rules:\n"
        "- Keep ALL keys exactly as-is.\n"
        "- Preserve all {{placeholder}} tokens verbatim — DO NOT translate text inside {{ and }}.\n"
        "- Keep newline characters and number lists intact.\n"
        "- Do NOT translate brand names, URLs, phone numbers, currency symbols, or numeric values.\n"
        "- Output ONLY a JSON object with the SAME keys, values translated. No prose, no markdown."
    )
    user = json.dumps(strings, ensure_ascii=False)
    raw = groq_chat(sys_prompt, user, max_tokens=2000)
    parsed = _extract_json(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"Translation parse failed: {raw[:200]}")
    # Keep only original keys and string values
    return {k: (parsed[k] if isinstance(parsed.get(k), str) else strings[k]) for k in strings.keys()}


def detect_language(text: str) -> str:
    """Return ISO 639-1 code (e.g., 'en', 'es', 'hi'). Falls back to 'en'."""
    if not text or len(text.strip()) < 2:
        return "en"
    sys_prompt = (
        "Detect the language of the message. Reply with ONLY a 2-letter ISO 639-1 code (e.g. 'en','es','hi','fr'). "
        "No prose, no quotes."
    )
    raw = groq_chat(sys_prompt, text[:300], max_tokens=8)
    code = (raw or "").strip().lower()
    code = re.sub(r"[^a-z]", "", code)[:2]
    return code if code and code in LANG_NAMES else "en"


def collect_translatable(nodes: list[dict]) -> dict:
    """Collect strings from nodes that should be translated. Returns flat dict path->text."""
    out: dict[str, str] = {}
    for n in nodes or []:
        nid = n.get("id")
        d = n.get("data") or {}
        for field in ("message", "prompt", "label"):
            v = d.get(field)
            if isinstance(v, str) and v.strip():
                out[f"{nid}.{field}"] = v
        opts = d.get("options")
        if isinstance(opts, list):
            for i, opt in enumerate(opts):
                if isinstance(opt, str) and opt.strip():
                    out[f"{nid}.options.{i}"] = opt
    return out


def apply_translation(nodes: list[dict], translation_flat: dict) -> list[dict]:
    """Return a deep-copy of nodes with translated strings applied (does not mutate input)."""
    import copy
    new_nodes = copy.deepcopy(nodes or [])
    for n in new_nodes:
        nid = n.get("id")
        d = n.setdefault("data", {})
        for field in ("message", "prompt", "label"):
            key = f"{nid}.{field}"
            if key in translation_flat:
                d[field] = translation_flat[key]
        opts = d.get("options")
        if isinstance(opts, list):
            new_opts = []
            for i, opt in enumerate(opts):
                key = f"{nid}.options.{i}"
                new_opts.append(translation_flat.get(key, opt))
            d["options"] = new_opts
    return new_nodes
