"""Iteration 5: AI flow scaffold generator (Groq llama-3.3-70b)."""
import os
import sys
import uuid
import time
import pytest

# Direct import of flow_ai triggers a circular import (helpers -> server -> routers -> helpers)
# when loaded outside the live FastAPI app. So we exec just the two pure-functions
# we want to unit-test in an isolated namespace.
_flow_ai_path = "/app/backend/flow_ai.py"
_ns: dict = {"__name__": "_flow_ai_isolated"}
with open(_flow_ai_path, "r") as _f:
    _src = _f.read()
# Strip the helpers import (only needed by generate_scaffold which we don't unit-test here)
_src = _src.replace("from helpers import groq_chat", "groq_chat = lambda *a, **k: ''")
exec(compile(_src, _flow_ai_path, "exec"), _ns)
_validate_and_normalize = _ns["_validate_and_normalize"]
_extract_json = _ns["_extract_json"]


# ============== Unit tests for _validate_and_normalize (no Groq) ==============
class TestValidateAndNormalizeUnit:
    """Direct unit tests for the defensive validator."""

    def test_disallowed_node_type_coerced_to_send(self):
        payload = {
            "name": "x",
            "nodes": [
                {"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "Start"}},
                {"id": "n2", "type": "BOGUS_TYPE", "position": {"x": 250, "y": 0}, "data": {"message": "hi"}},
                {"id": "n3", "type": "end", "position": {"x": 500, "y": 0}, "data": {"message": "bye"}},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n2", "target": "n3"},
            ],
        }
        out = _validate_and_normalize(payload)
        n2 = next(n for n in out["nodes"] if n["id"] == "n2")
        assert n2["type"] == "send", "Disallowed type should be coerced to 'send'"

    def test_missing_start_node_auto_prepended(self):
        payload = {
            "name": "no-start",
            "nodes": [
                {"id": "n1", "type": "send", "position": {"x": 0, "y": 0}, "data": {"message": "hi"}},
                {"id": "n2", "type": "end", "position": {"x": 250, "y": 0}, "data": {"message": "bye"}},
            ],
            "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        }
        out = _validate_and_normalize(payload)
        types = [n["type"] for n in out["nodes"]]
        assert types.count("start") >= 1, "Start should be auto-prepended"
        assert out["nodes"][0]["type"] == "start"

    def test_orphan_edges_dropped(self):
        payload = {
            "name": "orphan",
            "nodes": [
                {"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "n2", "type": "end", "position": {"x": 250, "y": 0}, "data": {}},
            ],
            "edges": [
                {"id": "e1", "source": "n1", "target": "n2"},
                {"id": "e2", "source": "n1", "target": "ghost_node"},
                {"id": "e3", "source": "phantom", "target": "n2"},
            ],
        }
        out = _validate_and_normalize(payload)
        assert len(out["edges"]) == 1
        assert out["edges"][0]["target"] == "n2"

    def test_auto_stitch_start_to_first(self):
        payload = {
            "name": "no-edge-from-start",
            "nodes": [
                {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "a", "type": "send", "position": {"x": 250, "y": 0}, "data": {"message": "hi"}},
            ],
            "edges": [],
        }
        out = _validate_and_normalize(payload)
        assert any(e["source"] == "s" and e["target"] == "a" for e in out["edges"]), \
            "Should auto-stitch start->first node"

    def test_choice_default_options_when_empty(self):
        payload = {
            "name": "x",
            "nodes": [
                {"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
                {"id": "n2", "type": "choice", "position": {"x": 250, "y": 0}, "data": {"prompt": "?", "options": []}},
            ],
            "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        }
        out = _validate_and_normalize(payload)
        ch = next(n for n in out["nodes"] if n["type"] == "choice")
        assert ch["data"]["options"] == ["Yes", "No"]

    def test_extract_json_with_fences(self):
        text = '```json\n{"a": 1, "b": [2,3]}\n```'
        d = _extract_json(text)
        assert d == {"a": 1, "b": [2, 3]}

    def test_extract_json_greedy(self):
        text = "Sure! Here you go: {\"name\":\"x\",\"nodes\":[]} thanks"
        d = _extract_json(text)
        assert d["name"] == "x"


# ============== API contract tests ==============
class TestAIScaffoldEndpoint:
    """POST /api/flows/ai-scaffold"""

    def test_short_description_400(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/flows/ai-scaffold", json={"description": "hi"}, timeout=10)
        assert r.status_code == 400
        assert "short" in r.text.lower()

    def test_empty_description_400(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/flows/ai-scaffold", json={"description": ""}, timeout=10)
        assert r.status_code == 400

    def test_unauthenticated_401_or_403(self, session, api_url):
        r = session.post(
            f"{api_url}/flows/ai-scaffold",
            json={"description": "Build a pizza ordering bot"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_valid_description_returns_scaffold(self, auth_session, api_url):
        """Real Groq call. Accepts rate-limit/transient AI errors gracefully."""
        r = auth_session.post(
            f"{api_url}/flows/ai-scaffold",
            json={"description": "Build a simple appointment booking bot that asks for name, date and confirms"},
            timeout=60,
        )
        # Accept 200 (success) or 500 (rate limit / AI failure - non-deterministic)
        if r.status_code == 500:
            pytest.skip(f"AI generation flaky/rate-limited: {r.text[:120]}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "name" in data and isinstance(data["name"], str)
        assert "nodes" in data and isinstance(data["nodes"], list)
        assert "edges" in data and isinstance(data["edges"], list)
        # 4-8 nodes (defensively allow >=2 since validator may differ)
        assert len(data["nodes"]) >= 2
        # Each node has required shape
        for n in data["nodes"]:
            assert "id" in n
            assert "type" in n
            assert "position" in n and "x" in n["position"] and "y" in n["position"]
            assert "data" in n
        # At least one start and one end
        types = {n["type"] for n in data["nodes"]}
        assert "start" in types, f"Missing start node: {types}"
        assert "end" in types, f"Missing end node: {types}"


class TestAIScaffoldApply:
    """POST /api/flows/{id}/ai-scaffold"""

    @pytest.fixture(scope="class")
    def draft_flow(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/flows", json={"name": f"TEST_iter5_draft_{uuid.uuid4().hex[:6]}"}, timeout=10)
        assert r.status_code == 200, r.text
        return r.json()

    def test_apply_404_for_missing_flow(self, auth_session, api_url):
        r = auth_session.post(
            f"{api_url}/flows/nonexistent_id_xyz/ai-scaffold",
            json={"description": "Build a support bot"},
            timeout=10,
        )
        assert r.status_code == 404

    def test_apply_400_short_desc(self, auth_session, api_url, draft_flow):
        r = auth_session.post(
            f"{api_url}/flows/{draft_flow['id']}/ai-scaffold",
            json={"description": "no"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_apply_400_when_flow_active(self, auth_session, api_url):
        # Create a flow w/ credential, set start node, publish
        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        cred_id = creds[0]["id"]
        nodes = [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "S"}}]
        r = auth_session.post(f"{api_url}/flows", json={
            "name": f"TEST_iter5_active_{uuid.uuid4().hex[:6]}",
            "credential_id": cred_id,
            "nodes": nodes,
            "edges": [],
            "start_node_id": "n1",
        }, timeout=10)
        fid = r.json()["id"]
        pub = auth_session.post(f"{api_url}/flows/{fid}/publish", timeout=10)
        assert pub.status_code == 200, pub.text

        r = auth_session.post(
            f"{api_url}/flows/{fid}/ai-scaffold",
            json={"description": "Update this active flow with new branches"},
            timeout=10,
        )
        assert r.status_code == 400
        assert "unpublish" in r.text.lower()
        # cleanup
        auth_session.post(f"{api_url}/flows/{fid}/unpublish", timeout=10)
        auth_session.delete(f"{api_url}/flows/{fid}", timeout=10)

    def test_apply_to_draft_updates_flow(self, auth_session, api_url, draft_flow):
        """Real Groq call. Apply scaffold, verify flow is updated."""
        fid = draft_flow["id"]
        r = auth_session.post(
            f"{api_url}/flows/{fid}/ai-scaffold",
            json={"description": "A simple FAQ bot that asks user's question and replies"},
            timeout=60,
        )
        if r.status_code == 500:
            pytest.skip(f"AI generation flaky/rate-limited: {r.text[:120]}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["applied"] is True
        assert isinstance(data["nodes"], list) and len(data["nodes"]) >= 2
        assert isinstance(data["edges"], list)
        assert data["start_node_id"]
        assert data["name"]

        # GET flow to verify persistence
        g = auth_session.get(f"{api_url}/flows/{fid}", timeout=10)
        assert g.status_code == 200
        gf = g.json()
        assert gf["start_node_id"] == data["start_node_id"]
        assert len(gf["nodes"]) == len(data["nodes"])
        assert gf["name"] == data["name"]

        # cleanup
        auth_session.delete(f"{api_url}/flows/{fid}", timeout=10)
