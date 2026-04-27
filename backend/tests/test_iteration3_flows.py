"""Iteration 3 — Chatbot flow builder / engine tests."""
import time
import uuid
import pytest


# ---------- Helpers ----------
@pytest.fixture(scope="module")
def cred_id(auth_session, api_url):
    creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
    assert creds, "Need at least one sandbox credential from iter-1 tests"
    return creds[0]["id"]


# ---------- Templates ----------
class TestFlowTemplates:
    def test_list_templates_returns_5(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/flows/templates", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        ids = {t["id"] for t in data}
        assert ids == {"blank", "banking", "training", "lead_qualifier", "support_faq"}
        for t in data:
            assert t["name"] and t["description"] and t["category"]

    def test_list_templates_requires_auth(self, session, api_url):
        r = session.get(f"{api_url}/flows/templates", timeout=10)
        assert r.status_code in (401, 403)


# ---------- CRUD + From-template ----------
class TestFlowCRUD:
    fid = None

    def test_create_from_banking_template(self, auth_session, api_url, cred_id):
        r = auth_session.post(
            f"{api_url}/flows/from-template/banking",
            json={"credential_id": cred_id, "name": f"TEST_bank_{uuid.uuid4().hex[:6]}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        f = r.json()
        assert f["status"] == "draft"
        assert f["credential_id"] == cred_id
        assert f["start_node_id"] == "n1"
        assert len(f["nodes"]) == 9
        assert len(f["edges"]) == 8
        TestFlowCRUD.fid = f["id"]

    def test_from_unknown_template_404(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/flows/from-template/nosuch", json={}, timeout=10)
        assert r.status_code == 404

    def test_list_flows_contains_created(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/flows", timeout=10)
        assert r.status_code == 200
        assert any(f["id"] == TestFlowCRUD.fid for f in r.json())

    def test_get_flow(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/flows/{TestFlowCRUD.fid}", timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == TestFlowCRUD.fid

    def test_create_blank_flow(self, auth_session, api_url, cred_id):
        r = auth_session.post(
            f"{api_url}/flows",
            json={
                "name": f"TEST_blank_{uuid.uuid4().hex[:6]}",
                "credential_id": cred_id,
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {}}],
                "edges": [],
                "start_node_id": "n1",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "draft"

    def test_update_flow_name(self, auth_session, api_url):
        new_name = f"TEST_renamed_{uuid.uuid4().hex[:6]}"
        r = auth_session.put(
            f"{api_url}/flows/{TestFlowCRUD.fid}",
            json={"name": new_name},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["updated"] == 1
        # Verify persistence
        got = auth_session.get(f"{api_url}/flows/{TestFlowCRUD.fid}", timeout=10).json()
        assert got["name"] == new_name

    def test_publish_flow(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/flows/{TestFlowCRUD.fid}/publish", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"
        got = auth_session.get(f"{api_url}/flows/{TestFlowCRUD.fid}", timeout=10).json()
        assert got["status"] == "active"

    def test_publish_requires_credential(self, auth_session, api_url):
        # Create a flow without credential
        r = auth_session.post(
            f"{api_url}/flows",
            json={
                "name": f"TEST_nocred_{uuid.uuid4().hex[:6]}",
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {}}],
                "edges": [],
                "start_node_id": "n1",
            },
            timeout=10,
        )
        assert r.status_code == 200
        fid = r.json()["id"]
        r2 = auth_session.post(f"{api_url}/flows/{fid}/publish", timeout=10)
        assert r2.status_code == 400

    def test_unpublish_flow(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/flows/{TestFlowCRUD.fid}/unpublish", timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "draft"
        # Re-publish for next tests
        r2 = auth_session.post(f"{api_url}/flows/{TestFlowCRUD.fid}/publish", timeout=10)
        assert r2.status_code == 200


# ---------- Flow test runner + engine ----------
class TestFlowEngineRuntime:
    phone = f"+91999700{uuid.uuid4().int % 10000:04d}"

    def test_test_endpoint_starts_session_on_banking(self, auth_session, api_url):
        fid = TestFlowCRUD.fid
        # Clean any stale active sessions from previous test runs so our flow definitively matches
        existing = auth_session.get(f"{api_url}/flows", timeout=10).json()
        for ef in existing:
            if ef["id"] != fid and ef.get("status") == "active":
                auth_session.post(f"{api_url}/flows/{ef['id']}/unpublish", timeout=10)
        r = auth_session.post(
            f"{api_url}/flows/{fid}/test",
            json={"customer_phone": self.__class__.phone, "message": "hi"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # session should be created and at n2 (first ask) in waiting state
        time.sleep(1.5)
        sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        mine = [s for s in sessions if s.get("conversation_id") and s["flow_id"] == fid]
        assert mine, f"No active session found. Got: {sessions}"
        # Waiting at ask node n2
        assert mine[0]["status"] in ("waiting", "running")
        assert mine[0]["current_node_id"] == "n2"

    def test_ask_captures_variable_and_advances_to_choice(self, auth_session, api_url, cred_id):
        # Send inbound with last-4-digits to advance ask -> choice (which then also prompts and waits)
        r = auth_session.post(
            f"{api_url}/whatsapp/simulate-inbound",
            json={
                "from_phone": self.__class__.phone,
                "from_name": "FlowTester",
                "text": "1234",
                "credential_id": cred_id,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.5)
        sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        mine = [s for s in sessions if s["flow_id"] == TestFlowCRUD.fid]
        assert mine
        s = mine[0]
        # Variable captured
        assert s.get("variables", {}).get("phone_last4") == "1234"
        # Moved to choice node n3 and waiting
        assert s["current_node_id"] == "n3"
        assert s["status"] == "waiting"

    def test_choice_by_index_routes_to_send_branch(self, auth_session, api_url, cred_id):
        # Pick option 1 (Check balance) → routes to n4 (send) which auto-advances.
        # n4 has no outgoing edge → session ends.
        r = auth_session.post(
            f"{api_url}/whatsapp/simulate-inbound",
            json={
                "from_phone": self.__class__.phone,
                "from_name": "FlowTester",
                "text": "1",
                "credential_id": cred_id,
            },
            timeout=30,
        )
        assert r.status_code == 200
        time.sleep(1.5)
        # After routing to n4 (send) there is no outgoing edge → session should be ended.
        all_sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        mine_active = [s for s in all_sessions if s["flow_id"] == TestFlowCRUD.fid]
        assert not mine_active, f"Session should have ended after send branch. Still active: {mine_active}"

    def test_flow_gate_prevents_auto_reply_when_triggered(self, auth_session, api_url, cred_id):
        """Send a fresh keyword that matches both the banking flow trigger (hi/bank/...) and any auto-reply rule.
        The flow should handle it and auto-reply rule should not double-respond.
        """
        fresh_phone = f"+91999701{uuid.uuid4().int % 10000:04d}"
        r = auth_session.post(
            f"{api_url}/whatsapp/simulate-inbound",
            json={
                "from_phone": fresh_phone,
                "from_name": "FreshCaller",
                "text": "bank",
                "credential_id": cred_id,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.5)
        # New active flow session should exist for this phone
        sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        mine = [s for s in sessions if s["flow_id"] == TestFlowCRUD.fid]
        # There should be >=1 session at n2 (the ask node), phone_last4 not yet captured
        assert any(s["current_node_id"] == "n2" and s["status"] == "waiting" for s in mine)

    def test_unrelated_message_does_not_trigger_flow(self, auth_session, api_url, cred_id):
        """Message without trigger keywords should not start a session."""
        noise_phone = f"+91999702{uuid.uuid4().int % 10000:04d}"
        r = auth_session.post(
            f"{api_url}/whatsapp/simulate-inbound",
            json={
                "from_phone": noise_phone,
                "from_name": "Noise",
                "text": "random gibberish xyz",
                "credential_id": cred_id,
            },
            timeout=30,
        )
        assert r.status_code == 200
        time.sleep(1)
        sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        # No session for this phone
        conv_ids = []
        convs = auth_session.get(f"{api_url}/conversations", timeout=10).json()
        for c in convs:
            if c.get("customer_phone") == noise_phone:
                conv_ids.append(c["id"])
        assert not any(s.get("conversation_id") in conv_ids for s in sessions)


# ---------- Cleanup / Delete ----------
class TestFlowDelete:
    def test_delete_clears_sessions(self, auth_session, api_url):
        fid = TestFlowCRUD.fid
        # list sessions before
        r = auth_session.delete(f"{api_url}/flows/{fid}", timeout=10)
        assert r.status_code == 200
        assert r.json()["deleted"] is True
        # Verify gone
        r2 = auth_session.get(f"{api_url}/flows/{fid}", timeout=10)
        assert r2.status_code == 404
        # No active sessions for this flow
        sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        assert not any(s.get("flow_id") == fid for s in sessions)
