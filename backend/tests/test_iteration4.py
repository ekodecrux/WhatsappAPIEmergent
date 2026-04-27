"""Iteration 4 — Condition node, /analytics, /qr endpoints."""
import base64
import time
import uuid
import pytest

# Inline copy of _eval_condition (avoid importing flow_engine which triggers server import chain)
def _eval_condition(left: str, op: str, right: str) -> bool:
    op = (op or "==").strip()
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


# ------------- Helpers -------------
@pytest.fixture(scope="module")
def cred_id(auth_session, api_url):
    creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
    assert creds, "Need at least one sandbox credential from iter-1 tests"
    return creds[0]["id"]


def _build_condition_flow_payload(cred_id, name, threshold=100):
    """Build: start -> ask(amount) -> condition(amount > threshold) -> send(true) | send(false)"""
    return {
        "name": name,
        "credential_id": cred_id,
        "triggers": [{"type": "keyword", "keywords": [f"cond_{uuid.uuid4().hex[:5]}"]}],
        "nodes": [
            {"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "n2", "type": "ask", "position": {"x": 200, "y": 0},
             "data": {"prompt": "Amount?", "variable": "amount"}},
            {"id": "n3", "type": "condition", "position": {"x": 400, "y": 0},
             "data": {"variable": "amount", "operator": ">", "value": str(threshold)}},
            {"id": "n4", "type": "send", "position": {"x": 600, "y": -50},
             "data": {"message": "TRUE_BRANCH_HIT_{{amount}}"}},
            {"id": "n5", "type": "send", "position": {"x": 600, "y": 50},
             "data": {"message": "FALSE_BRANCH_HIT_{{amount}}"}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n4", "label": "true"},
            {"id": "e4", "source": "n3", "target": "n5", "label": "false"},
        ],
        "start_node_id": "n1",
    }


# ------------- _eval_condition unit tests -------------
class TestEvalConditionHelper:
    def test_numeric_gt(self):
        assert _eval_condition("150", ">", "100") is True
        assert _eval_condition("50", ">", "100") is False

    def test_numeric_eq(self):
        assert _eval_condition("100", "==", "100") is True
        assert _eval_condition("99", "==", "100") is False

    def test_numeric_neq(self):
        assert _eval_condition("99", "!=", "100") is True

    def test_numeric_lt_lte_gte(self):
        assert _eval_condition("99", "<", "100") is True
        assert _eval_condition("100", "<=", "100") is True
        assert _eval_condition("100", ">=", "100") is True

    def test_string_contains(self):
        assert _eval_condition("hello world", "contains", "world") is True
        assert _eval_condition("hello", "contains", "xyz") is False

    def test_string_starts_with(self):
        assert _eval_condition("hello world", "starts_with", "hello") is True
        assert _eval_condition("hello", "starts_with", "world") is False

    def test_string_ends_with(self):
        assert _eval_condition("hello world", "ends_with", "world") is True
        assert _eval_condition("hello", "ends_with", "xxx") is False

    def test_string_eq_neq(self):
        assert _eval_condition("Yes", "==", "yes") is True  # case-insensitive fallback
        assert _eval_condition("Yes", "!=", "no") is True


# ------------- Condition node end-to-end via /test + simulate-inbound -------------
class TestConditionNodeRouting:
    """Build a flow with condition node, run it, verify routing for false (50<100)."""
    fid = None
    phone_false = f"+91999704{uuid.uuid4().int % 10000:04d}"
    phone_true = f"+91999705{uuid.uuid4().int % 10000:04d}"

    def test_create_and_publish_condition_flow(self, auth_session, api_url, cred_id):
        payload = _build_condition_flow_payload(
            cred_id, name=f"TEST_cond_{uuid.uuid4().hex[:6]}", threshold=100
        )
        r = auth_session.post(f"{api_url}/flows", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        TestConditionNodeRouting.fid = r.json()["id"]
        rp = auth_session.post(f"{api_url}/flows/{self.fid}/publish", timeout=10)
        assert rp.status_code == 200, rp.text
        assert rp.json()["status"] == "active"

    def test_false_branch_when_value_below_threshold(self, auth_session, api_url, cred_id):
        # Start session
        r = auth_session.post(
            f"{api_url}/flows/{self.fid}/test",
            json={"customer_phone": self.phone_false, "message": "go"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.0)
        # Should be waiting at ask node n2
        sessions = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        mine = [s for s in sessions if s["flow_id"] == self.fid and s["current_node_id"] == "n2"]
        assert mine, f"Expected ask wait at n2; got {sessions}"

        # Send "50" -> condition(50>100=false) -> n5 (send)
        r2 = auth_session.post(
            f"{api_url}/whatsapp/simulate-inbound",
            json={
                "from_phone": self.phone_false,
                "from_name": "CondTester",
                "text": "50",
                "credential_id": cred_id,
            },
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        time.sleep(1.5)

        # Session should have ended at n5 (send w/ no outgoing edge).
        all_active = auth_session.get(f"{api_url}/flows/sessions/active", timeout=10).json()
        still_active = [s for s in all_active if s["flow_id"] == self.fid and s["current_node_id"] in ("n2",)]
        assert not still_active, "Should not be waiting at n2 after sending value"

        # Verify outbound message text contains FALSE_BRANCH (via messages collection through API)
        convs = auth_session.get(f"{api_url}/conversations", timeout=10).json()
        my_conv = next((c for c in convs if c.get("customer_phone") == self.phone_false), None)
        assert my_conv, "conversation not found"
        msgs = auth_session.get(f"{api_url}/conversations/{my_conv['id']}/messages", timeout=10).json()
        assert isinstance(msgs, list), f"messages list expected: {msgs}"
        outbound_texts = " ".join(m.get("content", "") for m in msgs if m.get("direction") == "outbound")
        assert "FALSE_BRANCH_HIT_50" in outbound_texts, f"Expected FALSE branch fired. Got: {outbound_texts}"

    def test_true_branch_when_value_above_threshold(self, auth_session, api_url, cred_id):
        # Start fresh session for new phone
        r = auth_session.post(
            f"{api_url}/flows/{self.fid}/test",
            json={"customer_phone": self.phone_true, "message": "go"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.0)

        r2 = auth_session.post(
            f"{api_url}/whatsapp/simulate-inbound",
            json={
                "from_phone": self.phone_true,
                "from_name": "CondTester",
                "text": "250",
                "credential_id": cred_id,
            },
            timeout=20,
        )
        assert r2.status_code == 200
        time.sleep(1.5)

        convs = auth_session.get(f"{api_url}/conversations", timeout=10).json()
        my_conv = next((c for c in convs if c.get("customer_phone") == self.phone_true), None)
        assert my_conv
        msgs = auth_session.get(f"{api_url}/conversations/{my_conv['id']}/messages", timeout=10).json()
        assert isinstance(msgs, list), f"messages list expected: {msgs}"
        outbound_texts = " ".join(m.get("content", "") for m in msgs if m.get("direction") == "outbound")
        assert "TRUE_BRANCH_HIT_250" in outbound_texts, f"Expected TRUE branch fired. Got: {outbound_texts}"


# ------------- Analytics endpoint -------------
class TestFlowAnalytics:
    def test_analytics_returns_totals_and_node_stats(self, auth_session, api_url):
        fid = TestConditionNodeRouting.fid
        assert fid, "Need flow id from previous class"
        r = auth_session.get(f"{api_url}/flows/{fid}/analytics", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "totals" in data and "node_stats" in data
        t = data["totals"]
        for k in ("sessions", "completed", "active", "completion_rate"):
            assert k in t, f"missing totals.{k}"
        assert isinstance(t["sessions"], int)
        # We ran 2 sessions
        assert t["sessions"] >= 2
        # node_stats should have one entry per node (5 nodes in our condition flow)
        ns = data["node_stats"]
        assert isinstance(ns, list)
        assert len(ns) == 5
        for ent in ns:
            for k in ("node_id", "type", "label", "visits", "drop_off", "drop_off_pct"):
                assert k in ent, f"missing node_stats.{k}"
        # node n3 (condition) should have at least 2 visits (one per test call)
        n3 = next((e for e in ns if e["node_id"] == "n3"), None)
        assert n3 and n3["visits"] >= 2, f"n3 visits expected >=2, got {n3}"
        # completion_rate computed
        assert isinstance(t["completion_rate"], (int, float))

    def test_analytics_404_for_unknown_flow(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/flows/nonexistent_flow_xyz/analytics", timeout=10)
        assert r.status_code == 404


# ------------- QR endpoint -------------
class TestFlowQR:
    def test_qr_returns_url_and_image(self, auth_session, api_url):
        fid = TestConditionNodeRouting.fid
        r = auth_session.get(f"{api_url}/flows/{fid}/qr", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("url", "image_base64", "keyword", "phone"):
            assert k in data, f"missing {k}"
        assert data["url"].startswith("https://wa.me/"), data["url"]
        assert data["keyword"]  # non-empty
        assert data["phone"]
        # image_base64 should decode to PNG (header '\x89PNG')
        assert isinstance(data["image_base64"], str) and len(data["image_base64"]) > 100
        raw = base64.b64decode(data["image_base64"])
        assert raw[:8] == b"\x89PNG\r\n\x1a\n", "image_base64 is not a valid PNG"
        # url should encode the keyword in ?text=
        assert "text=" in data["url"]

    def test_qr_400_when_no_credential(self, auth_session, api_url):
        # Create a flow without credential
        r = auth_session.post(
            f"{api_url}/flows",
            json={
                "name": f"TEST_qr_nocred_{uuid.uuid4().hex[:5]}",
                "nodes": [{"id": "n1", "type": "start", "position": {"x": 0, "y": 0}, "data": {}}],
                "edges": [],
                "start_node_id": "n1",
            },
            timeout=10,
        )
        assert r.status_code == 200
        fid = r.json()["id"]
        rq = auth_session.get(f"{api_url}/flows/{fid}/qr", timeout=10)
        assert rq.status_code == 400, rq.text

    def test_qr_404_unknown_flow(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/flows/nonexistent_xyz/qr", timeout=10)
        assert r.status_code == 404


# ------------- node_visits tracking -------------
class TestNodeVisitsTracking:
    def test_node_visits_incremented_on_each_step(self, auth_session, api_url):
        """Verify analytics reflects node_visits increments by sessions tracking."""
        fid = TestConditionNodeRouting.fid
        before = auth_session.get(f"{api_url}/flows/{fid}/analytics", timeout=10).json()
        before_n2 = next((e for e in before["node_stats"] if e["node_id"] == "n2"), {}).get("visits", 0)

        # Start one more test session
        new_phone = f"+91999706{uuid.uuid4().int % 10000:04d}"
        auth_session.post(
            f"{api_url}/flows/{fid}/test",
            json={"customer_phone": new_phone, "message": "go"},
            timeout=15,
        )
        time.sleep(1.5)

        after = auth_session.get(f"{api_url}/flows/{fid}/analytics", timeout=10).json()
        after_n2 = next((e for e in after["node_stats"] if e["node_id"] == "n2"), {}).get("visits", 0)
        assert after_n2 >= before_n2 + 1, f"n2 visits should grow. before={before_n2} after={after_n2}"


# ------------- Cleanup -------------
class TestFlowCleanup:
    def test_delete_condition_flow(self, auth_session, api_url):
        fid = TestConditionNodeRouting.fid
        r = auth_session.delete(f"{api_url}/flows/{fid}", timeout=10)
        assert r.status_code == 200
