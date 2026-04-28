"""Iteration 7: WhatsApp credentials (Meta validation), test-send, sandbox-info, Meta webhooks."""
import os
import time
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Load backend .env to pick up MONGO_URL / DB_NAME / META_VERIFY_TOKEN
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


# ============== /whatsapp/credentials POST — Meta Cloud validation ==============
class TestMetaCloudCredentials:
    def test_meta_invalid_token_rejected_with_clear_message(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/whatsapp/credentials", json={
            "name": "TEST_iter7_meta_invalid",
            "provider": "meta_cloud",
            "access_token": "INVALID_TOKEN_NOT_EAA_PREFIXED_xxx",
            "phone_number_id": "999999999999999",
        }, timeout=20)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "Meta credentials invalid" in detail, f"Detail missing prefix: {detail}"
        # Meta typically returns 'Invalid OAuth access token' or 'Cannot parse access token'
        assert any(k in detail.lower() for k in ["oauth", "access token", "parse", "session"]), detail

    def test_meta_missing_fields_rejected(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/whatsapp/credentials", json={
            "name": "TEST_iter7_meta_missing",
            "provider": "meta_cloud",
        }, timeout=15)
        assert r.status_code == 400
        assert "access_token" in r.json().get("detail", "")
        assert "phone_number_id" in r.json().get("detail", "")

    def test_unsupported_provider_rejected(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/whatsapp/credentials", json={
            "name": "TEST_iter7_bogus",
            "provider": "carrier_pigeon",
        }, timeout=10)
        # Pydantic may reject earlier with 422, or our endpoint with 400
        assert r.status_code in (400, 422)


# ============== /whatsapp/sandbox-info ==============
class TestSandboxInfo:
    def test_sandbox_info(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/whatsapp/sandbox-info", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["sandbox_phone"] == "+14155238886", data
        assert "join_keyword" in data
        assert "instructions" in data and len(data["instructions"]) > 20
        assert "console_url" in data and data["console_url"].startswith("https://")

    def test_sandbox_info_requires_auth(self, session, api_url):
        r = session.get(f"{api_url}/whatsapp/sandbox-info", timeout=10)
        assert r.status_code == 401


# ============== /whatsapp/test-send ==============
@pytest.fixture(scope="class")
def sandbox_cred(auth_session, api_url):
    """Create or reuse a twilio_sandbox cred for test-send tests."""
    # Reuse an existing sandbox cred if present
    r = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10)
    assert r.status_code == 200
    for c in r.json():
        if c.get("provider") == "twilio_sandbox":
            return c
    # Otherwise create one
    r = auth_session.post(f"{api_url}/whatsapp/credentials", json={
        "name": "TEST_iter7_sandbox",
        "provider": "twilio_sandbox",
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


class TestTestSend:
    def test_test_send_malformed_phone(self, auth_session, api_url, sandbox_cred):
        r = auth_session.post(f"{api_url}/whatsapp/test-send", json={
            "credential_id": sandbox_cred["id"],
            "to_phone": "919876543210",  # missing +
            "text": "hello",
        }, timeout=15)
        assert r.status_code == 400
        assert "E.164" in r.json().get("detail", "")

    def test_test_send_missing_fields(self, auth_session, api_url, sandbox_cred):
        r = auth_session.post(f"{api_url}/whatsapp/test-send", json={
            "credential_id": sandbox_cred["id"],
        }, timeout=10)
        assert r.status_code == 400

    def test_test_send_persists_message(self, auth_session, api_url, sandbox_cred):
        to_phone = "+15558675309"  # not opted-in, will fail at Twilio with 63007
        text = f"TEST_iter7 ping {int(time.time())}"
        r = auth_session.post(f"{api_url}/whatsapp/test-send", json={
            "credential_id": sandbox_cred["id"],
            "to_phone": to_phone,
            "text": text,
        }, timeout=30)
        # Should always 200 (Twilio returns failure inside body, not as HTTP error)
        assert r.status_code == 200, r.text
        body = r.json()
        # Either success (queued) OR failure — both should be persisted
        assert "success" in body
        if not body["success"]:
            # Hint should be present for opt-in errors
            assert "error" in body
            # hint may be None for non-opt-in errors but field exists
            assert "hint" in body

        # Verify message persisted in chat by listing conversations
        r2 = auth_session.get(f"{api_url}/conversations", timeout=10)
        assert r2.status_code == 200
        convs = r2.json()
        match = [c for c in convs if c.get("customer_phone") == to_phone]
        assert match, "test-send did not create conversation"


# ============== Meta webhook GET (verify) ==============
class TestMetaWebhookVerify:
    def test_meta_verify_correct_token(self, session, api_url):
        expected = os.environ.get("META_VERIFY_TOKEN", "wabridge-meta-verify")
        r = session.get(
            f"{api_url}/whatsapp/webhook/meta",
            params={"hub.mode": "subscribe", "hub.verify_token": expected, "hub.challenge": "CHAL12345"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.text == "CHAL12345"

    def test_meta_verify_wrong_token(self, session, api_url):
        r = session.get(
            f"{api_url}/whatsapp/webhook/meta",
            params={"hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "X"},
            timeout=10,
        )
        assert r.status_code == 403


# ============== Meta webhook POST (inbound + status) ==============
class TestMetaWebhookInbound:
    @pytest.fixture(scope="class")
    def meta_cred(self, auth_session, api_url):
        """Insert a meta_cloud cred directly via DB-bypass — done via creating w/ twilio_sandbox
        and patching DB is overkill. Instead we hit the webhook endpoint with a phone_number_id
        that doesn't exist — we just verify the endpoint accepts the payload gracefully (no 500).
        For positive flow, we need a real meta_cloud cred. Try to plant one via mongo if possible.
        """
        # We'll just plant via direct mongo since no API path bypasses validation.
        try:
            from pymongo import MongoClient
            cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            dbname = os.environ.get("DB_NAME", "test_database")
            db = cli[dbname]
            # Use the demo tenant id
            user = db.users.find_one({"email": "demo@test.com"})
            if not user:
                pytest.skip("demo user not seeded")
            tid = user["tenant_id"]
            cred_id = "TEST_iter7_meta_cred"
            db.whatsapp_credentials.delete_many({"id": cred_id})
            db.whatsapp_credentials.insert_one({
                "id": cred_id,
                "tenant_id": tid,
                "name": "TEST_iter7_meta_synthetic",
                "provider": "meta_cloud",
                "account_sid_enc": "",
                "auth_token_enc": "",
                "whatsapp_from": "+15551112222",
                "access_token_enc": "",
                "phone_number_id": "TEST_PNID_iter7",
                "is_verified": True,
                "status": "active",
                "created_at": "2026-01-01T00:00:00",
            })
            yield {"id": cred_id, "tenant_id": tid, "phone_number_id": "TEST_PNID_iter7"}
            db.whatsapp_credentials.delete_many({"id": cred_id})
        except Exception as e:
            pytest.skip(f"Cannot seed mongo: {e}")

    def test_meta_inbound_message_creates_conversation(self, session, api_url, meta_cred):
        from_phone_raw = "919999988888"
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "ENTRY1",
                "changes": [{
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {"phone_number_id": meta_cred["phone_number_id"]},
                        "messages": [{
                            "from": from_phone_raw,
                            "id": "wamid.iter7test1",
                            "type": "text",
                            "text": {"body": "Hello from Meta test"},
                            "timestamp": "1735689600",
                        }],
                    },
                }],
            }],
        }
        r = session.post(f"{api_url}/whatsapp/webhook/meta", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        # Verify conversation persisted
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = cli[os.environ.get("DB_NAME", "test_database")]
        conv = db.conversations.find_one({"tenant_id": meta_cred["tenant_id"], "customer_phone": "+" + from_phone_raw})
        assert conv is not None, "Meta inbound did not create conversation"
        msg = db.messages.find_one({"conversation_id": conv["id"], "direction": "inbound", "message_id": "wamid.iter7test1"})
        assert msg is not None, "Inbound message not persisted"

    def test_meta_status_updates_message(self, session, api_url, meta_cred):
        # First, plant an outbound message with a known message_id
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = cli[os.environ.get("DB_NAME", "test_database")]
        msg_id = "wamid.iter7status1"
        db.messages.delete_many({"message_id": msg_id})
        db.messages.insert_one({
            "id": "TEST_iter7_msg1", "tenant_id": meta_cred["tenant_id"],
            "direction": "outbound", "content": "x", "status": "sent",
            "message_id": msg_id, "sent_at": "2026-01-01T00:00:00", "conversation_id": "x",
        })
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{"id": "E", "changes": [{"field": "messages", "value": {
                "metadata": {"phone_number_id": meta_cred["phone_number_id"]},
                "statuses": [{"id": msg_id, "status": "delivered", "timestamp": "1735689700"}],
            }}]}],
        }
        r = session.post(f"{api_url}/whatsapp/webhook/meta", json=payload, timeout=15)
        assert r.status_code == 200
        updated = db.messages.find_one({"message_id": msg_id})
        assert updated and updated["status"] == "delivered"
        db.messages.delete_many({"message_id": msg_id})


# ============== Regression — existing endpoints still healthy ==============
class TestRegression:
    def test_languages(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/flows/_languages", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 20

    def test_marketplace_templates(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/marketplace/templates", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_delivery(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/dashboard/delivery", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # totals are nested under "totals"
        totals = d.get("totals", {})
        for k in ("total", "delivered", "failed", "pending", "delivery_rate", "failure_rate"):
            assert k in totals, f"{k} missing from totals: {totals}"
        assert "status_counts" in d
        assert "by_campaign" in d
        assert "recent_failed" in d

    def test_credentials_list(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_simulate_inbound(self, auth_session, api_url, sandbox_cred):
        r = auth_session.post(f"{api_url}/whatsapp/simulate-inbound", json={
            "credential_id": sandbox_cred["id"],
            "from_phone": "+15550009999",
            "text": "regression test inbound",
        }, timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ============== Cleanup TEST_ data ==============
@pytest.fixture(scope="module", autouse=True)
def cleanup_after(auth_session, api_url):
    yield
    try:
        r = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10)
        if r.status_code == 200:
            for c in r.json():
                if c.get("name", "").startswith("TEST_iter7"):
                    auth_session.delete(f"{api_url}/whatsapp/credentials/{c['id']}", timeout=10)
    except Exception:
        pass
