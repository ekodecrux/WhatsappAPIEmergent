"""Iteration 10: Templates with media + Campaigns from templates"""
import os
import uuid
import pytest
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


# ===== Helpers =====
def _login_or_register(email, password="Test1234!", company="Test Co"):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        # register
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": password, "full_name": "T User", "company_name": company,
        }, timeout=15)
        assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def tenant_a():
    return _login_or_register("demo@test.com", "demo1234", "Demo Inc")


@pytest.fixture(scope="module")
def tenant_b():
    email = f"tenant_b_{uuid.uuid4().hex[:6]}@example.com"
    return _login_or_register(email, "Test1234!", "Tenant B Co")


@pytest.fixture(scope="module")
def credential_a(tenant_a):
    # Use sandbox credential (no creds required)
    name = f"TEST_iter10_cred_{uuid.uuid4().hex[:6]}"
    r = tenant_a.post(f"{API}/whatsapp/credentials", json={
        "name": name, "provider": "twilio_sandbox",
    }, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def credential_b(tenant_b):
    name = f"TEST_iter10_credB_{uuid.uuid4().hex[:6]}"
    r = tenant_b.post(f"{API}/whatsapp/credentials", json={
        "name": name, "provider": "twilio_sandbox",
    }, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ============ Templates with media ============
class TestTemplatesWithMedia:
    def test_create_template_with_media_url_and_media_type(self, tenant_a):
        name = f"TEST_iter10_tpl_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": name,
            "category": "MARKETING",
            "header": "🎉 Big Sale",
            "body": "Get 50% off this weekend!",
            "footer": "T&C apply",
            "language": "en",
            "media_url": "https://example.com/banner.jpg",
            "media_type": "image",
        }
        r = tenant_a.post(f"{API}/whatsapp/templates", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        assert data["media_url"] == "https://example.com/banner.jpg"
        assert data["media_type"] == "image"
        assert data["header"] == "🎉 Big Sale"
        assert "id" in data
        pytest.shared_template_id = data["id"]
        pytest.shared_template_name = name

    def test_list_templates_includes_media_fields(self, tenant_a):
        r = tenant_a.get(f"{API}/whatsapp/templates", timeout=15)
        assert r.status_code == 200
        templates = r.json()
        match = [t for t in templates if t.get("id") == pytest.shared_template_id]
        assert len(match) == 1, "Template not found in list"
        t = match[0]
        assert t["media_url"] == "https://example.com/banner.jpg"
        assert t["media_type"] == "image"

    def test_create_template_without_media_persists_none(self, tenant_a):
        r = tenant_a.post(f"{API}/whatsapp/templates", json={
            "name": f"TEST_iter10_nomedia_{uuid.uuid4().hex[:6]}",
            "category": "UTILITY",
            "body": "Plain template body",
        }, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("media_url") is None
        assert d.get("media_type") is None


# ============ Campaign creation from templates ============
class TestCampaignFromTemplate:
    def test_campaign_with_template_id_only_composes_message_and_inherits_media(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_camp_tplonly_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "template_id": pytest.shared_template_id,
            "recipients": ["+15551112222"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        # Composed = header + body + footer joined by \n\n
        assert c["message"] == "🎉 Big Sale\n\nGet 50% off this weekend!\n\nT&C apply"
        assert c["template_id"] == pytest.shared_template_id
        assert c["template_name"] == pytest.shared_template_name
        assert c["media_url"] == "https://example.com/banner.jpg"
        assert c["media_type"] == "image"

    def test_campaign_with_template_id_and_custom_message_overrides(self, tenant_a, credential_a):
        custom = "Custom override message body"
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_camp_override_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "template_id": pytest.shared_template_id,
            "message": custom,
            "recipients": ["+15551112223"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["message"] == custom
        # Lineage preserved
        assert c["template_id"] == pytest.shared_template_id
        assert c["template_name"] == pytest.shared_template_name

    def test_campaign_with_cross_tenant_template_id_returns_400(self, tenant_b, credential_b):
        # Use tenant_a's template id from tenant_b session
        r = tenant_b.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_cross_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_b,
            "template_id": pytest.shared_template_id,
            "recipients": ["+15551112224"],
        }, timeout=15)
        assert r.status_code == 400, r.text
        assert "Template not found" in r.text

    def test_campaign_with_no_message_no_template_no_variants_returns_400(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_empty_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "recipients": ["+15551112225"],
        }, timeout=15)
        assert r.status_code == 400, r.text
        assert "Message is required" in r.text

    def test_campaign_with_empty_message_and_template_id_succeeds(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_empty_tpl_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "template_id": pytest.shared_template_id,
            "message": "",
            "recipients": ["+15551112226"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["message"].startswith("🎉 Big Sale")

    def test_campaign_with_empty_message_and_variants_succeeds(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_var_only_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "message": "",
            "recipients": ["+15551112227", "+15551112228"],
            "variants": [
                {"name": "A", "message": "Variant A msg", "weight": 50},
                {"name": "B", "message": "Variant B msg", "weight": 50},
            ],
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["is_ab_test"] is True
        assert len(c["variants"]) == 2
        assert c["template_id"] is None


# ============ Regression ============
class TestRegression:
    def test_explicit_message_no_template(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_reg_plain_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "message": "Hello classic campaign",
            "recipients": ["+15551112229"],
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["message"] == "Hello classic campaign"
        assert c["template_id"] is None
        assert c["template_name"] is None
        assert c["is_ab_test"] is False

    def test_ab_campaign_no_template(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_reg_ab_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "message": "Main fallback message",
            "recipients": ["+15551112230", "+15551112231"],
            "variants": [
                {"name": "A", "message": "Var A", "weight": 60},
                {"name": "B", "message": "Var B", "weight": 40},
            ],
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["is_ab_test"] is True
        assert sum(int(v["weight"]) for v in c["variants"]) == 100

    def test_top_level_media_independent_of_templates(self, tenant_a, credential_a):
        r = tenant_a.post(f"{API}/campaigns", json={
            "name": f"TEST_iter10_reg_media_{uuid.uuid4().hex[:6]}",
            "credential_id": credential_a,
            "message": "Check out this image!",
            "recipients": ["+15551112232"],
            "media_url": "https://example.com/standalone.jpg",
            "media_type": "image",
        }, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["media_url"] == "https://example.com/standalone.jpg"
        assert c["media_type"] == "image"
        assert c["template_id"] is None
