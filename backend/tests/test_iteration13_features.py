"""Iteration 13 - Final sprint feature tests.

Tests:
- Catalog CRUD + Razorpay pay-link checkout
- AI assist: spam-score, optimal-send-time, reply-coach
- Sandbox enable/status/disable
- Billing plans + orders with annual cycle
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://messaging-vault.preview.emergentagent.com").rstrip("/")
DEMO_EMAIL = "demo@test.com"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def auth_headers():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# =========== Catalog ===========
class TestCatalog:
    def test_create_list_update_delete(self, auth_headers):
        # Create
        payload = {"name": "TEST_iter13_widget", "description": "Test product", "price_inr": 499.0,
                   "image_url": "https://picsum.photos/200", "in_stock": True, "category": "test"}
        r = requests.post(f"{BASE_URL}/api/catalog/products", json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["name"] == payload["name"]
        assert prod["price_inr"] == 499.0
        assert "id" in prod
        pid = prod["id"]

        # List
        r = requests.get(f"{BASE_URL}/api/catalog/products", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert pid in ids

        # Update
        upd = {**payload, "price_inr": 599.0, "name": "TEST_iter13_widget_v2"}
        r = requests.patch(f"{BASE_URL}/api/catalog/products/{pid}", json=upd, headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["price_inr"] == 599.0
        assert r.json()["name"] == "TEST_iter13_widget_v2"

        # Checkout
        r = requests.post(f"{BASE_URL}/api/catalog/checkout",
                          json={"product_id": pid, "customer_phone": "+919999000111", "customer_name": "Tester"},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        co = r.json()
        assert "wa_message_template" in co
        assert "pay_url" in co
        assert co["pay_url"].endswith(co["checkout_id"])
        assert "TEST_iter13_widget_v2" in co["wa_message_template"]

        # Delete
        r = requests.delete(f"{BASE_URL}/api/catalog/products/{pid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted"] is True


# =========== AI Assist ===========
class TestAIAssist:
    def test_spam_score_spammy(self, auth_headers):
        body = "FREE!!! WIN A PRIZE NOW!!! ACT URGENT, CLICK HERE: http://bit.ly/x GUARANTEED WINNER!!!"
        r = requests.post(f"{BASE_URL}/api/ai-assist/spam-score",
                          json={"body": body, "category": "marketing"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["score"] >= 70, f"Expected >=70, got {d['score']}"
        assert d["label"] == "danger"
        assert isinstance(d.get("issues"), list)

    def test_spam_score_neutral(self, auth_headers):
        body = "Hi Asha, thanks for your message. Your order will reach you on Friday."
        r = requests.post(f"{BASE_URL}/api/ai-assist/spam-score",
                          json={"body": body, "category": "marketing"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["label"] == "good", f"Expected 'good' got {d['label']} score={d['score']}"

    def test_optimal_send_time(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/ai-assist/optimal-send-time", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("best_hour_label", "best_day_label", "confidence"):
            assert k in d, f"missing {k}"

    def test_reply_coach(self, auth_headers):
        # Find or create a conversation
        r = requests.get(f"{BASE_URL}/api/conversations", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        convs = r.json()
        if isinstance(convs, dict):
            convs = convs.get("items") or convs.get("conversations") or []
        if not convs:
            pytest.skip("No conversations available — run sandbox enable first")
        cid = convs[0]["id"]
        r = requests.post(f"{BASE_URL}/api/ai-assist/reply-coach",
                          json={"conversation_id": cid, "draft": "Sure, "}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "completion" in d


# =========== Sandbox ===========
class TestSandbox:
    def test_enable_status_disable(self, auth_headers):
        # Check initial status
        r = requests.get(f"{BASE_URL}/api/sandbox/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        was_active = r.json().get("active", False)

        # If already active, disable first to test fresh seed
        if was_active:
            requests.post(f"{BASE_URL}/api/sandbox/disable", headers=auth_headers, timeout=30)

        # Enable
        r = requests.post(f"{BASE_URL}/api/sandbox/enable", headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        if not d.get("already_active"):
            s = d.get("summary", {})
            assert s.get("conversations", 0) >= 30
            assert s.get("leads", 0) >= 100
            assert s.get("campaigns", 0) >= 3

        # Status reflects active
        r = requests.get(f"{BASE_URL}/api/sandbox/status", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["active"] is True
        assert d["counts"]["conversations"] >= 30
        assert d["counts"]["leads"] >= 100

        # Disable
        r = requests.post(f"{BASE_URL}/api/sandbox/disable", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["disabled"] is True

        # Status reflects inactive
        r = requests.get(f"{BASE_URL}/api/sandbox/status", headers=auth_headers, timeout=15)
        assert r.json()["active"] is False
        assert r.json()["counts"]["conversations"] == 0


# =========== Billing ===========
class TestBilling:
    def test_plans(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/billing/plans", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        plans = r.json()
        if isinstance(plans, dict):
            plans = plans.get("plans") or plans.get("items") or []
        assert len(plans) >= 3, f"Expected >=3 plans got {len(plans)}"
        for p in plans:
            assert "price_inr" in p
            assert "annual_inr" in p

    def test_create_annual_order(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/billing/plans", headers=auth_headers, timeout=15)
        plans = r.json()
        if isinstance(plans, dict):
            plans = plans.get("plans") or plans.get("items") or []
        plan_id = plans[1].get("id") or plans[1].get("plan") or plans[1].get("name", "").lower()
        r = requests.post(f"{BASE_URL}/api/billing/orders",
                          json={"plan": plan_id, "billing_cycle": "annual"},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("billing_cycle") == "annual"
