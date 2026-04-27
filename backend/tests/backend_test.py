"""Backend regression tests for WhatsApp SaaS platform"""
import os
import time
import uuid
import pytest


# ---------- Health / Auth ----------
class TestHealthAndAuth:
    def test_health(self, session, api_url):
        r = session.get(f"{api_url}/health", timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_register_creates_tenant_and_returns_jwt(self, session, api_url):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{api_url}/auth/register", json={
            "email": email, "password": "Pass1234!",
            "full_name": "TEST User", "company_name": "TEST Co",
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["access_token"]
        assert data["email"] == email.lower()
        assert data["role"] == "admin"
        assert data["plan"] == "trial"
        assert data["trial_days_left"] == 14
        assert data["company_name"] == "TEST Co"

    def test_register_duplicate_fails(self, session, api_url):
        r = session.post(f"{api_url}/auth/register", json={
            "email": "demo@test.com", "password": "demo1234",
            "full_name": "Dup", "company_name": "Dup Co",
        }, timeout=15)
        assert r.status_code == 400

    def test_login_demo_user(self, session, api_url):
        r = session.post(f"{api_url}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["access_token"]
        assert data["email"] == "demo@test.com"

    def test_login_invalid(self, session, api_url):
        r = session.post(f"{api_url}/auth/login", json={"email": "demo@test.com", "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_me_returns_user_and_tenant(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/auth/me", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"]
        assert data["tenant"]["company_name"]
        assert "trial_days_left" in data


# ---------- WhatsApp Credentials ----------
class TestWhatsAppCredentials:
    cred_id = None

    def test_create_sandbox_credential(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/whatsapp/credentials", json={
            "name": f"TEST_sandbox_{uuid.uuid4().hex[:6]}",
            "provider": "twilio_sandbox",
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["provider"] == "twilio_sandbox"
        assert data["is_verified"] is True
        assert data["whatsapp_from"]
        TestWhatsAppCredentials.cred_id = data["id"]

    def test_list_credentials_masked(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        # Each should have masked sid
        assert any("account_sid_masked" in i for i in items)

    def test_unsupported_provider_400(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/whatsapp/credentials", json={
            "name": "x", "provider": "junk",
        }, timeout=10)
        assert r.status_code == 400


# ---------- Simulate Inbound (creates conversation + AI suggestion) ----------
class TestSimulateInbound:
    def test_simulate_inbound_creates_conversation(self, auth_session, api_url):
        # Need a credential
        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        assert creds, "Need credential first"
        cred_id = creds[0]["id"]

        r = auth_session.post(f"{api_url}/whatsapp/simulate-inbound", json={
            "from_phone": "+919999900001",
            "from_name": "TEST_Caller",
            "text": "I want to know your pricing",
            "credential_id": cred_id,
        }, timeout=30)  # AI may take 3-5s
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["conversation_id"]
        assert data["message_id"]
        # Suggestion may be None if AI fails - that's OK, but field should exist
        assert "suggestion" in data

    def test_conversations_listed(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/conversations", timeout=10)
        assert r.status_code == 200
        convs = r.json()
        assert isinstance(convs, list)
        assert len(convs) >= 1

    def test_messages_for_conversation(self, auth_session, api_url):
        convs = auth_session.get(f"{api_url}/conversations", timeout=10).json()
        cid = convs[0]["id"]
        r = auth_session.get(f"{api_url}/conversations/{cid}/messages", timeout=10)
        assert r.status_code == 200
        msgs = r.json()
        assert isinstance(msgs, list)
        assert len(msgs) >= 1


# ---------- Campaigns ----------
class TestCampaigns:
    cid = None

    def test_create_campaign_pending(self, auth_session, api_url):
        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        cred_id = creds[0]["id"]
        r = auth_session.post(f"{api_url}/campaigns", json={
            "name": f"TEST_campaign_{uuid.uuid4().hex[:6]}",
            "credential_id": cred_id,
            "message": "Hello from test campaign",
            "recipients": ["+919000000001", "+919000000002"],
        }, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "pending_approval"
        assert data["total_recipients"] == 2
        TestCampaigns.cid = data["id"]

    def test_list_campaigns(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/campaigns", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_approve_campaign(self, auth_session, api_url):
        assert TestCampaigns.cid
        r = auth_session.post(f"{api_url}/campaigns/{TestCampaigns.cid}/approve", json={"approve": True}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "running"


# ---------- Leads ----------
class TestLeads:
    lead_id = None

    def test_create_lead(self, auth_session, api_url):
        phone = f"+9180000{uuid.uuid4().int % 100000:05d}"
        r = auth_session.post(f"{api_url}/leads", json={
            "phone": phone, "name": "TEST Lead", "email": "t@test.com", "source": "manual",
        }, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["phone"] == phone
        TestLeads.lead_id = d["id"]

    def test_list_leads(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/leads", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_lead(self, auth_session, api_url):
        assert TestLeads.lead_id
        r = auth_session.patch(f"{api_url}/leads/{TestLeads.lead_id}", json={"status": "qualified"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["updated"] == 1

    def test_import_leads_bulk(self, auth_session, api_url):
        items = [
            {"phone": f"+9171111{uuid.uuid4().int % 100000:05d}", "name": "TEST Imp1"},
            {"phone": f"+9172222{uuid.uuid4().int % 100000:05d}", "name": "TEST Imp2"},
            {"phone": "", "name": "should-skip"},
        ]
        r = auth_session.post(f"{api_url}/leads/import", json={"items": items}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["inserted"] == 2
        assert data["skipped"] >= 1

    def test_delete_lead(self, auth_session, api_url):
        assert TestLeads.lead_id
        r = auth_session.delete(f"{api_url}/leads/{TestLeads.lead_id}", timeout=10)
        assert r.status_code == 200
        assert r.json()["deleted"] is True


# ---------- Auto-reply rules ----------
class TestAutoReplyRules:
    rule_id = None

    def test_create_rule(self, auth_session, api_url):
        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        cred_id = creds[0]["id"]
        r = auth_session.post(f"{api_url}/auto-reply-rules", json={
            "credential_id": cred_id,
            "name": f"TEST_rule_{uuid.uuid4().hex[:6]}",
            "trigger_keywords": ["price", "cost"],
            "trigger_type": "keyword",
            "reply_message": "Our pricing starts at $10/mo",
            "is_active": True,
            "priority": 5,
        }, timeout=10)
        assert r.status_code == 200, r.text
        TestAutoReplyRules.rule_id = r.json()["id"]

    def test_list_rules(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/auto-reply-rules", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_toggle_rule(self, auth_session, api_url):
        assert TestAutoReplyRules.rule_id
        r = auth_session.patch(f"{api_url}/auto-reply-rules/{TestAutoReplyRules.rule_id}", json={"is_active": False}, timeout=10)
        assert r.status_code == 200
        assert r.json()["updated"] == 1


# ---------- Templates ----------
class TestTemplates:
    def test_create_template(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/whatsapp/templates", json={
            "name": f"TEST_tpl_{uuid.uuid4().hex[:6]}",
            "category": "marketing",
            "body": "Hello {{name}}, check out our offer!",
            "language": "en",
        }, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

    def test_list_templates(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/whatsapp/templates", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Billing ----------
class TestBilling:
    def test_list_plans(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/billing/plans", timeout=10)
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 4

    def test_create_razorpay_order(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/billing/orders", json={"plan": "basic"}, timeout=20)
        # Razorpay test should succeed
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["order_id"]
        assert data["amount"]
        assert data["key_id"]


# ---------- Dashboard ----------
class TestDashboard:
    def test_overview(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/dashboard/overview", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "metrics" in d
        assert "tenant" in d
        assert "limits" in d

    def test_timeseries(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/dashboard/timeseries?days=14", timeout=15)
        assert r.status_code == 200
        s = r.json()
        assert isinstance(s, list)
        assert len(s) == 14


# ---------- Integrations / API key + ERP ----------
class TestIntegrations:
    api_key = None

    def test_create_api_key_returns_raw_once(self, auth_session, api_url):
        r = auth_session.post(f"{api_url}/integrations/api-keys", json={
            "name": f"TEST_key_{uuid.uuid4().hex[:6]}",
            "scopes": ["send_message", "create_lead"],
        }, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["api_key"]
        assert d["key_prefix"] == d["api_key"][:8]
        TestIntegrations.api_key = d["api_key"]

    def test_list_api_keys_no_hash(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/integrations/api-keys", timeout=10)
        assert r.status_code == 200
        items = r.json()
        for it in items:
            assert "key_hash" not in it

    def test_erp_send_with_api_key_no_500(self, api_url):
        """Should NOT 500 even if Twilio sandbox rejects (no opt-in)."""
        assert TestIntegrations.api_key
        import requests
        r = requests.post(
            f"{api_url}/integrations/erp/send-message",
            headers={"X-API-Key": TestIntegrations.api_key, "Content-Type": "application/json"},
            json={"to_phone": "+919999988888", "message": "ERP test"},
            timeout=20,
        )
        assert r.status_code != 500, f"ERP send returned 500: {r.text}"
        assert r.status_code == 200, r.text
        # Body returns success bool from twilio helper
        d = r.json()
        assert "success" in d

    def test_erp_unauth(self, api_url):
        import requests
        r = requests.post(
            f"{api_url}/integrations/erp/send-message",
            headers={"X-API-Key": "wa_invalid", "Content-Type": "application/json"},
            json={"to_phone": "+919", "message": "x"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_audit_logs(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/integrations/audit-logs", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
