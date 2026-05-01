"""Iteration 16 — Hybrid LLM failover + /app/connect-whatsapp wizard backend contracts.

Tests:
  - POST /api/ai-assist/spam-score: spammy + neutral payloads return valid JSON with score/label/issues
  - POST /api/ai-assist/reply-coach: returns {completion} for a real conversation_id
  - POST /api/whatsapp/twilio/diagnose: 404 for bogus cred_id, returns diagnose shape for saved cred
  - GET /api/onboarding/status: channel step href is /app/connect-whatsapp (NOT /app/whatsapp)
"""
import os
import secrets
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
DEMO = {"email": "demo@test.com", "password": "demo1234"}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(client):
    r = client.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=15)
    if r.status_code != 200 or "access_token" not in r.json():
        pytest.skip(f"Demo login failed: {r.status_code} {r.text[:200]}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth_client(client, auth_token):
    client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return client


# ============ AI-ASSIST: spam-score ============
class TestSpamScore:
    def test_spammy_input_returns_danger(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/ai-assist/spam-score",
            json={"body": "FREE PRIZES NOW CLICK HERE !!!!", "category": "marketing"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "score" in d and "label" in d and "issues" in d
        assert isinstance(d["score"], int)
        assert isinstance(d["issues"], list)
        assert d["score"] >= 70, f"expected spammy score>=70 got {d['score']}"
        assert d["label"] == "danger", f"expected label=danger got {d['label']}"

    def test_neutral_input_not_danger(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/ai-assist/spam-score",
            json={"body": "Hi, here is your order confirmation, ETA tomorrow.", "category": "utility"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["label"] in ("good", "warning"), f"neutral msg got label={d['label']}"

    def test_unauth_rejected(self, client):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{BASE_URL}/api/ai-assist/spam-score", json={"body": "hi"}, timeout=10)
        assert r.status_code == 401


# ============ AI-ASSIST: reply-coach ============
class TestReplyCoach:
    def test_reply_coach_with_conv(self, auth_client):
        # Create or find a conversation. Try /api/conversations first
        r = auth_client.get(f"{BASE_URL}/api/conversations", timeout=15)
        conv_id = None
        if r.status_code == 200:
            data = r.json()
            items = data if isinstance(data, list) else data.get("items") or data.get("conversations") or []
            if items:
                conv_id = items[0].get("id")

        if not conv_id:
            # Fallback: create a lead/conversation via leads → messages path, or skip
            # Try creating a lead then sending a message to spawn conv
            lr = auth_client.post(
                f"{BASE_URL}/api/leads",
                json={"name": f"TEST_coach_{secrets.token_hex(3)}", "phone": "+919876500000"},
                timeout=15,
            )
            if lr.status_code in (200, 201):
                # Some apps auto-create conversation on first message — query again
                time.sleep(0.3)
                r2 = auth_client.get(f"{BASE_URL}/api/conversations", timeout=15)
                if r2.status_code == 200:
                    data = r2.json()
                    items = data if isinstance(data, list) else data.get("items") or data.get("conversations") or []
                    if items:
                        conv_id = items[0].get("id")

        if not conv_id:
            pytest.skip("No conversation available to test reply-coach")

        r = auth_client.post(
            f"{BASE_URL}/api/ai-assist/reply-coach",
            json={"conversation_id": conv_id, "draft": "Thanks for reaching out,"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "completion" in d
        assert isinstance(d["completion"], str)

    def test_reply_coach_bogus_conv_404(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/ai-assist/reply-coach",
            json={"conversation_id": f"bogus-{uuid.uuid4().hex}", "draft": "hi"},
            timeout=15,
        )
        assert r.status_code == 404


# ============ WhatsApp diagnose ============
class TestTwilioDiagnose:
    def test_bogus_credential_returns_404(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/whatsapp/twilio/diagnose",
            json={"credential_id": f"does-not-exist-{uuid.uuid4().hex[:8]}"},
            timeout=20,
        )
        assert r.status_code == 404, r.text

    def test_missing_credential_id_returns_400(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/whatsapp/twilio/diagnose", json={}, timeout=15)
        assert r.status_code == 400

    def test_real_cred_returns_diagnose_shape(self, auth_client):
        # Create a throw-away credential
        payload = {
            "name": f"TEST_diag_{secrets.token_hex(3)}",
            "provider": "twilio",
            "account_sid": "ACbogus0000000000000000000000000000",
            "auth_token": "bogusauthtoken",
            "from_address": "+14155238886",
            "whatsapp_from": "+14155238886",
        }
        cr = auth_client.post(f"{BASE_URL}/api/whatsapp/credentials", json=payload, timeout=20)
        if cr.status_code not in (200, 201):
            pytest.skip(f"Could not create cred: {cr.status_code} {cr.text[:150]}")
        cred_id = cr.json().get("id")
        assert cred_id

        try:
            r = auth_client.post(
                f"{BASE_URL}/api/whatsapp/twilio/diagnose",
                json={"credential_id": cred_id},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            d = r.json()
            # Must contain all documented keys
            for key in ("account_status", "configured_from", "whatsapp_senders",
                        "configured_from_matches", "sandbox_active", "suggested_action"):
                assert key in d, f"missing key {key} in diagnose response: {d}"
            # With bogus creds we expect auth_failed or error
            assert d["account_status"] in ("active", "closed", "error", "auth_failed", "unknown")
            assert isinstance(d["whatsapp_senders"], list)
            assert isinstance(d["configured_from_matches"], bool)
            assert isinstance(d["sandbox_active"], bool)
        finally:
            # Best-effort cleanup
            try:
                auth_client.delete(f"{BASE_URL}/api/whatsapp/credentials/{cred_id}", timeout=10)
            except Exception:
                pass


# ============ Onboarding channel href ============
class TestOnboardingChannelHref:
    def test_channel_step_points_to_connect_wizard(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/onboarding/status", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        steps = d.get("steps") or []
        channel_step = next(
            (s for s in steps if "channel" in (s.get("id", "") + s.get("key", "") + s.get("title", "")).lower()
             or "whatsapp" in (s.get("title", "") + s.get("id", "")).lower()),
            None,
        )
        assert channel_step is not None, f"No channel step found in {steps}"
        href = channel_step.get("href") or channel_step.get("url") or ""
        assert "/app/connect-whatsapp" in href, (
            f"Expected channel href /app/connect-whatsapp but got {href!r}. Full step: {channel_step}"
        )
