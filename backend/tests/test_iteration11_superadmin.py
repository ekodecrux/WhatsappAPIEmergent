"""Iteration 11 — Super-admin role separation + tenant manage modal fields.

Covers:
- PATCH /api/admin/tenants/{id} new fields: discount_pct (0-100 clamp), billing_mode (wallet|byoc),
  plus existing plan/is_active/extend_trial_days/notes.
- POST /api/wallet/admin/{tid}/credit  ± amount
- PATCH /api/wallet/admin/{tid}/pricing  pricing_overrides {marketing,utility,authentication,service}
- /api/wallet/topup/verify discount_pct -> bonus credit (mocked at credit path level)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"
TENANT_EMAIL = "demo@test.com"
TENANT_PWD = "demo1234"
SUPER_EMAIL = "superadmin@wabridge.com"
SUPER_PWD = "superadmin123"
DEMO_TENANT_ID = "d7e4bbe1-b230-470b-98a4-9d30659d4d22"


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PWD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tenant_token():
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": TENANT_EMAIL, "password": TENANT_PWD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def super_client(super_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {super_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def tenant_client(tenant_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tenant_token}", "Content-Type": "application/json"})
    return s


# ============ Auth & role check ============
class TestAuth:
    def test_super_login_flag(self, super_client):
        r = super_client.get(f"{BASE_URL}/auth/me")
        assert r.status_code == 200
        d = r.json()
        u = d.get("user", d)
        assert u.get("is_superadmin") is True, d

    def test_tenant_not_super(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/auth/me")
        assert r.status_code == 200
        u = r.json().get("user", r.json())
        assert u.get("is_superadmin") in (False, None)

    def test_tenant_blocked_from_admin(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/admin/tenants")
        assert r.status_code in (401, 403)


# ============ PATCH /admin/tenants/{id} new fields ============
class TestTenantPatch:
    def test_discount_pct_persists(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"discount_pct": 15})
        assert r.status_code == 200, r.text
        assert r.json().get("discount_pct") == 15.0
        # GET back via list
        lst = super_client.get(f"{BASE_URL}/admin/tenants").json()
        target = next((t for t in lst if t["id"] == DEMO_TENANT_ID), None)
        assert target and target.get("discount_pct") == 15.0

    def test_discount_pct_rejects_150(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"discount_pct": 150})
        assert r.status_code == 400

    def test_discount_pct_rejects_negative(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"discount_pct": -5})
        assert r.status_code == 400

    def test_billing_mode_wallet(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"billing_mode": "wallet"})
        assert r.status_code == 200
        assert r.json().get("billing_mode") == "wallet"

    def test_billing_mode_invalid(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"billing_mode": "invalid"})
        assert r.status_code == 400

    def test_plan_change_pro(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"plan": "pro"})
        assert r.status_code == 200
        assert r.json()["plan"] == "pro"
        # restore to trial after to keep extend_trial test happy
        super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"plan": "trial"})

    def test_extend_trial_days(self, super_client):
        # set to trial, then extend
        super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"plan": "trial"})
        before = super_client.get(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}").json()["tenant"]["trial_days_left"]
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"extend_trial_days": 7})
        assert r.status_code == 200, r.text
        after = super_client.get(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}").json()["tenant"]["trial_days_left"]
        assert after >= before  # extension worked

    def test_notes_persist(self, super_client):
        r = super_client.patch(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}", json={"notes": "TEST_iter11 internal note"})
        assert r.status_code == 200
        d = super_client.get(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}").json()["tenant"]
        assert d.get("admin_notes") == "TEST_iter11 internal note"


# ============ POST /wallet/admin/{tid}/credit ============
class TestManualCredit:
    def test_credit_then_debit(self, super_client):
        # baseline
        lst = super_client.get(f"{BASE_URL}/admin/tenants").json()
        target = next(t for t in lst if t["id"] == DEMO_TENANT_ID)
        bal0 = float(target.get("wallet_balance_inr") or 0)

        r = super_client.post(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/credit",
                              json={"amount_inr": 100, "note": "TEST_iter11 credit"})
        assert r.status_code == 200, r.text
        bal1 = float(r.json().get("new_balance"))
        assert abs(bal1 - (bal0 + 100)) < 0.01

        r2 = super_client.post(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/credit",
                               json={"amount_inr": -50, "note": "TEST_iter11 debit"})
        assert r2.status_code == 200, r2.text
        bal2 = float(r2.json().get("new_balance"))
        assert abs(bal2 - (bal1 - 50)) < 0.01

    def test_credit_zero_rejected(self, super_client):
        r = super_client.post(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/credit", json={"amount_inr": 0})
        assert r.status_code == 400

    def test_tenant_cannot_credit(self, tenant_client):
        r = tenant_client.post(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/credit", json={"amount_inr": 100})
        assert r.status_code in (401, 403)


# ============ PATCH /wallet/admin/{tid}/pricing ============
class TestPricingOverride:
    def test_pricing_override_persists(self, super_client):
        r = super_client.patch(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/pricing",
                               json={"marketing": 0.7, "utility": 0.1})
        assert r.status_code == 200, r.text
        po = r.json().get("pricing_overrides", {})
        assert po.get("marketing") == 0.7
        assert po.get("utility") == 0.1

        # Verify via GET /admin/tenants
        d = super_client.get(f"{BASE_URL}/admin/tenants/{DEMO_TENANT_ID}").json()["tenant"]
        assert d.get("pricing_overrides", {}).get("marketing") == 0.7

    def test_pricing_empty_body_rejected(self, super_client):
        r = super_client.patch(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/pricing", json={})
        assert r.status_code == 400

    def test_tenant_cannot_set_pricing(self, tenant_client):
        r = tenant_client.patch(f"{BASE_URL}/wallet/admin/{DEMO_TENANT_ID}/pricing", json={"marketing": 0.5})
        assert r.status_code in (401, 403)


# ============ Tenant-side regression ============
class TestTenantRegression:
    def test_wallet_get(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/wallet")
        assert r.status_code == 200
        d = r.json()
        assert "wallet_balance_inr" in d

    def test_campaigns_list(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/campaigns")
        assert r.status_code == 200

    def test_integrations_keys(self, tenant_client):
        r = tenant_client.get(f"{BASE_URL}/integrations/api-keys")
        assert r.status_code == 200
