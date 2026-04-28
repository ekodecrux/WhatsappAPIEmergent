"""Iteration 11: Wallet/Credits monetization tests.

Covers:
- GET /api/wallet
- POST /api/wallet/billing-mode
- POST /api/wallet/topup/order (Razorpay test mode)
- POST /api/wallet/topup/verify (invalid signature path; valid sig requires real payment)
- GET /api/wallet/transactions
- GET /api/wallet/estimate
- Per-message billing via /api/whatsapp/send (charge + refund on provider failure)
- Insufficient balance path
- Super-admin pricing override + manual credit + revenue
"""
import os
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


# ---------- session-scoped fixtures ----------
@pytest.fixture(scope="module")
def demo_login():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def demo_token(demo_login):
    return demo_login["access_token"]


@pytest.fixture(scope="module")
def demo_tenant_id(demo_login):
    # /auth/login returns flat shape {tenant_id, user_id, ...}
    return demo_login.get("tenant_id") or demo_login.get("user", {}).get("tenant_id")


@pytest.fixture(scope="module")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"email": "superadmin@wabridge.com", "password": "superadmin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def credential_id(demo_token):
    """Pick first available WhatsApp credential (twilio_sandbox preferred)."""
    r = requests.get(f"{API}/whatsapp/credentials", headers=_H.of(demo_token), timeout=10)
    assert r.status_code == 200, r.text
    creds = r.json() or []
    sandbox = [c for c in creds if c.get("provider") == "twilio_sandbox"]
    pool = sandbox or creds
    if not pool:
        pytest.skip("No WhatsApp credentials configured for demo tenant")
    return pool[0]["id"]


class _H:
    """Wrapper class to bypass pytest 9 auto-fixture detection of module-level callables."""
    @staticmethod
    def of(tok):
        return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class _SP:
    @staticmethod
    def make(cred_id, body):
        return {"credential_id": cred_id, "to_phone": "+15005550006", "content": body}



def _SP_dummy_make(cred_id, body):
    return {"credential_id": cred_id, "to_phone": "+15005550006", "content": body}


# ===================== GET /api/wallet =====================
class TestWallet:
    def test_get_wallet_shape(self, demo_token):
        r = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["billing_mode", "wallet_balance_inr", "pricing_inr",
                  "estimated_marketing_messages_left", "estimated_utility_messages_left",
                  "low_balance_threshold_inr"]:
            assert k in d, f"missing key {k}"
        assert d["billing_mode"] in ("wallet", "byoc")
        assert d["pricing_inr"]["marketing"] > 0
        assert d["pricing_inr"]["service"] == 0.0
        assert isinstance(d["estimated_marketing_messages_left"], int)

    def test_set_billing_mode_wallet(self, demo_token):
        r = requests.post(f"{API}/wallet/billing-mode", json={"billing_mode": "wallet"},
                          headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["billing_mode"] == "wallet"

    def test_set_billing_mode_invalid(self, demo_token):
        r = requests.post(f"{API}/wallet/billing-mode", json={"billing_mode": "invalid"},
                          headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 422, r.text


# ===================== TOPUP =====================
class TestTopup:
    def test_topup_order_min_amount_validation(self, demo_token):
        r = requests.post(f"{API}/wallet/topup/order", json={"amount_inr": 50},
                          headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 422, r.text

    def test_topup_order_creates_razorpay_order(self, demo_token):
        r = requests.post(f"{API}/wallet/topup/order", json={"amount_inr": 1000},
                          headers=_H.of(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["order_id"].startswith("order_")
        assert d["amount"] == 100000  # paise
        assert d["currency"] == "INR"
        assert d["key_id"].startswith("rzp_")
        assert d["amount_inr"] == 1000

    def test_topup_verify_invalid_signature(self, demo_token):
        # Use bogus sig - we expect 400 (signature mismatch). Real valid signature requires
        # actual payment through Razorpay UI which can't run in headless test.
        r = requests.post(f"{API}/wallet/topup/order", json={"amount_inr": 500},
                          headers=_H.of(demo_token), timeout=15)
        order_id = r.json()["order_id"]
        bad = {"razorpay_order_id": order_id, "razorpay_payment_id": "pay_FAKE",
               "razorpay_signature": "0" * 64, "plan": "wallet"}
        r2 = requests.post(f"{API}/wallet/topup/verify", json=bad, headers=_H.of(demo_token), timeout=10)
        assert r2.status_code == 400, r2.text


# ===================== TRANSACTIONS / ESTIMATE =====================
class TestTransactionsAndEstimate:
    def test_list_transactions(self, demo_token):
        r = requests.get(f"{API}/wallet/transactions", headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            for k in ("type", "amount_inr", "balance_after"):
                assert k in rows[0], f"missing {k}"
            # sorted desc by created_at
            ts = [row.get("created_at", "") for row in rows]
            assert ts == sorted(ts, reverse=True)

    def test_estimate(self, demo_token):
        r = requests.get(f"{API}/wallet/estimate?recipients=100&category=marketing",
                         headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price_per_conversation"] == 0.85
        assert d["estimated_total_inr"] == 85.0
        assert "wallet_balance_inr" in d and "billing_mode" in d and "covered" in d


# ===================== SUPER ADMIN =====================
class TestSuperAdmin:
    def test_pricing_override_and_revert(self, super_token, demo_token, demo_tenant_id):
        # set marketing override to 0.5
        r = requests.patch(f"{API}/wallet/admin/{demo_tenant_id}/pricing",
                           json={"marketing": 0.5}, headers=_H.of(super_token), timeout=10)
        assert r.status_code == 200, r.text

        # Verify via tenant's own wallet
        w = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10).json()
        assert w["pricing_inr"]["marketing"] == 0.5

        # revert to default
        r = requests.patch(f"{API}/wallet/admin/{demo_tenant_id}/pricing",
                           json={"marketing": 0.85}, headers=_H.of(super_token), timeout=10)
        assert r.status_code == 200

    def test_pricing_override_forbidden_for_non_super(self, demo_token, demo_tenant_id):
        r = requests.patch(f"{API}/wallet/admin/{demo_tenant_id}/pricing",
                           json={"marketing": 0.1}, headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 403

    def test_manual_credit_and_debit(self, super_token, demo_token, demo_tenant_id):
        # snapshot balance
        before = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10).json()["wallet_balance_inr"]

        # credit +100
        r = requests.post(f"{API}/wallet/admin/{demo_tenant_id}/credit",
                          json={"amount_inr": 100, "note": "TEST_credit"},
                          headers=_H.of(super_token), timeout=10)
        assert r.status_code == 200, r.text
        assert abs(r.json()["new_balance"] - (before + 100)) < 0.01

        # debit -50
        r = requests.post(f"{API}/wallet/admin/{demo_tenant_id}/credit",
                          json={"amount_inr": -50, "note": "TEST_debit"},
                          headers=_H.of(super_token), timeout=10)
        assert r.status_code == 200, r.text
        # verify ledger entry
        txns = requests.get(f"{API}/wallet/transactions", headers=_H.of(demo_token), timeout=10).json()
        types = [t["type"] for t in txns[:5]]
        assert "admin_debit" in types or "admin_credit" in types

    def test_revenue_endpoint(self, super_token):
        r = requests.get(f"{API}/wallet/admin/revenue?days=30", headers=_H.of(super_token), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("topups_inr", "message_debits_inr", "approx_margin_inr", "by_type"):
            assert k in d

    def test_revenue_forbidden_for_non_super(self, demo_token):
        r = requests.get(f"{API}/wallet/admin/revenue?days=7", headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 403


# ===================== PER-MESSAGE BILLING =====================
class TestMessageBilling:
    """Send a marketing message and verify wallet_charged + refunded on Twilio failure."""

    def test_send_marketing_charges_and_refunds(self, demo_token, demo_tenant_id, super_token, credential_id):
        # Ensure tenant on wallet mode w/ enough balance
        requests.post(f"{API}/wallet/billing-mode", json={"billing_mode": "wallet"},
                      headers=_H.of(demo_token), timeout=10)
        bal = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10).json()["wallet_balance_inr"]
        if bal < 5:
            requests.post(f"{API}/wallet/admin/{demo_tenant_id}/credit",
                          json={"amount_inr": 50}, headers=_H.of(super_token), timeout=10)
        bal_before = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10).json()["wallet_balance_inr"]

        # Trigger send (Twilio magic number 15005550006 will fail at provider → expect refund)
        r = requests.post(f"{API}/whatsapp/send", json=_SP.make(credential_id, "TEST_billing_marketing"),
                          headers=_H.of(demo_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "billing" in d, f"no billing in response: {d}"
        b = d["billing"]
        assert b.get("charged") is True
        assert b.get("price_inr") == 0.85
        assert b.get("category") == "marketing"

        # examine recent ledger entries — debit + (optional) refund (since send likely failed)
        txns = requests.get(f"{API}/wallet/transactions?limit=10",
                            headers=_H.of(demo_token), timeout=10).json()
        recent_types = [t["type"] for t in txns[:5]]
        assert "debit" in recent_types, recent_types

        # If provider failed, ensure refund was issued
        if not d.get("success"):
            assert "refund" in recent_types, f"refund missing after failed send: {recent_types}"
            bal_after = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10).json()["wallet_balance_inr"]
            assert abs(bal_after - bal_before) < 0.01, f"balance changed after refund: {bal_before} -> {bal_after}"

    def test_insufficient_balance_blocks_send(self, demo_token, demo_tenant_id, super_token, credential_id):
        # Drain wallet to below price
        cur = requests.get(f"{API}/wallet", headers=_H.of(demo_token), timeout=10).json()["wallet_balance_inr"]
        if cur > 0.10:
            debit = round(cur - 0.10, 2)
            r = requests.post(f"{API}/wallet/admin/{demo_tenant_id}/credit",
                              json={"amount_inr": -debit}, headers=_H.of(super_token), timeout=10)
            assert r.status_code == 200, r.text

        r = requests.post(f"{API}/whatsapp/send", json=_SP.make(credential_id, "TEST_insufficient"),
                          headers=_H.of(demo_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("success") is False, d
        assert d.get("billing", {}).get("reason") == "insufficient_balance", d
        # No SID returned (provider was not called)
        assert not d.get("sid"), f"provider was called! sid={d.get('sid')}"

        # restore balance for downstream tests
        requests.post(f"{API}/wallet/admin/{demo_tenant_id}/credit",
                      json={"amount_inr": 500}, headers=_H.of(super_token), timeout=10)

    def test_byoc_passthrough_no_charge(self, demo_token, demo_tenant_id, super_token, credential_id):
        # Switch to byoc
        r = requests.post(f"{API}/wallet/billing-mode", json={"billing_mode": "byoc"},
                          headers=_H.of(demo_token), timeout=10)
        assert r.status_code == 200
        before_count = len(requests.get(f"{API}/wallet/transactions",
                                        headers=_H.of(demo_token), timeout=10).json())

        r = requests.post(f"{API}/whatsapp/send", json=_SP.make(credential_id, "TEST_byoc"),
                          headers=_H.of(demo_token), timeout=20)
        assert r.status_code == 200, r.text
        b = r.json().get("billing", {})
        assert b.get("charged") in (False, None), b

        after_count = len(requests.get(f"{API}/wallet/transactions",
                                       headers=_H.of(demo_token), timeout=10).json())
        assert after_count == before_count, f"BYOC should not create wallet txns ({before_count}->{after_count})"

        # restore wallet mode
        requests.post(f"{API}/wallet/billing-mode", json={"billing_mode": "wallet"},
                      headers=_H.of(demo_token), timeout=10)
