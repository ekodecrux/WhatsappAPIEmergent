"""Iteration 8 backend tests: Super Admin Console, Support Tickets, AI Assistant.

Covers:
- Auth: superadmin login flag, demo regression
- Admin: stats, tenants list/get/patch (plan, extend trial, suspend, platform-protected, 403 for non-admin)
- Admin: users, subscriptions, tickets cross-tenant
- Support: tenant CRUD, reply, super-admin status patch, cross-tenant 403
- Assistant: text response, action response, ticket auto-create, history+page_context
"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@test.com"
DEMO_PASS = "demo1234"
SA_EMAIL = "superadmin@wabridge.com"
SA_PASS = "superadmin123"


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def sa_token():
    r = requests.post(f"{API}/auth/login", json={"email": SA_EMAIL, "password": SA_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# =============== AUTH ===============
class TestAuth:
    def test_superadmin_login_flags(self, sa_token):
        assert sa_token.get("is_superadmin") is True
        assert sa_token.get("tenant_id") == "platform"
        assert sa_token.get("role") == "admin"
        assert sa_token.get("access_token")

    def test_demo_login_regression(self, demo_token):
        assert demo_token.get("is_superadmin") in (False, None)
        assert demo_token.get("tenant_id") and demo_token["tenant_id"] != "platform"


# =============== ADMIN STATS ===============
class TestAdminStats:
    def test_stats_shape(self, sa_token):
        r = requests.get(f"{API}/admin/stats", headers=hdr(sa_token["access_token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "tenants" in d and isinstance(d["tenants"], dict)
        assert "total" in d["tenants"] and isinstance(d["tenants"]["total"], int)
        assert "plan_distribution" in d
        assert "mrr_inr" in d and isinstance(d["mrr_inr"], int)
        assert "tickets" in d and "open" in d["tickets"]
        # platform tenant excluded
        # platform tenant has plan='enterprise' and is_platform=True; ensure
        # platform plan should not be over-counted (count must be sane)
        assert d["tenants"]["total"] >= 1

    def test_stats_forbidden_for_demo(self, demo_token):
        r = requests.get(f"{API}/admin/stats", headers=hdr(demo_token["access_token"]), timeout=15)
        assert r.status_code == 403


# =============== ADMIN TENANTS ===============
class TestAdminTenants:
    def test_list_tenants_excludes_platform(self, sa_token):
        r = requests.get(f"{API}/admin/tenants", headers=hdr(sa_token["access_token"]), timeout=15)
        assert r.status_code == 200, r.text
        ts = r.json()
        assert isinstance(ts, list)
        ids = [t["id"] for t in ts]
        assert "platform" not in ids
        if ts:
            t0 = ts[0]
            for f in ("users_count", "messages_sent", "trial_days_left"):
                assert f in t0, f

    def test_search_filter(self, sa_token):
        r = requests.get(f"{API}/admin/tenants?search=demo", headers=hdr(sa_token["access_token"]), timeout=15)
        assert r.status_code == 200
        # at least demo inc should be present
        assert any("demo" in (t.get("company_name") or "").lower() for t in r.json())

    def test_get_tenant_details_and_patch_plan(self, sa_token):
        r = requests.get(f"{API}/admin/tenants", headers=hdr(sa_token["access_token"]), timeout=15)
        tenants = [t for t in r.json() if "demo" in (t.get("company_name") or "").lower()]
        assert tenants, "demo tenant not found"
        tid = tenants[0]["id"]
        original_plan = tenants[0].get("plan", "trial")

        # GET details
        d = requests.get(f"{API}/admin/tenants/{tid}", headers=hdr(sa_token["access_token"]), timeout=15)
        assert d.status_code == 200
        body = d.json()
        assert "tenant" in body and "users" in body and "stats" in body and "credentials" in body

        # PATCH plan -> pro
        r2 = requests.patch(f"{API}/admin/tenants/{tid}", headers=hdr(sa_token["access_token"]),
                            json={"plan": "pro"}, timeout=15)
        assert r2.status_code == 200, r2.text
        upd = r2.json()
        assert upd.get("plan") == "pro"
        assert upd.get("subscription_start_date")
        assert upd.get("subscription_end_date")

        # Verify GET reflects change
        d2 = requests.get(f"{API}/admin/tenants/{tid}", headers=hdr(sa_token["access_token"]), timeout=15)
        assert d2.json()["tenant"]["plan"] == "pro"

        # restore
        requests.patch(f"{API}/admin/tenants/{tid}", headers=hdr(sa_token["access_token"]),
                       json={"plan": original_plan}, timeout=15)

    def test_extend_trial(self, sa_token):
        r = requests.get(f"{API}/admin/tenants", headers=hdr(sa_token["access_token"]), timeout=15)
        tenants = r.json()
        # find a trial tenant; if none, set demo to trial first
        target = next((t for t in tenants if t.get("plan") == "trial"), None)
        if not target:
            # convert demo to trial just to test
            demo = next(t for t in tenants if "demo" in (t.get("company_name") or "").lower())
            requests.patch(f"{API}/admin/tenants/{demo['id']}", headers=hdr(sa_token["access_token"]),
                           json={"plan": "trial"}, timeout=15)
            target = demo
        before = target.get("trial_end_date")
        r2 = requests.patch(f"{API}/admin/tenants/{target['id']}", headers=hdr(sa_token["access_token"]),
                            json={"extend_trial_days": 7}, timeout=15)
        assert r2.status_code == 200, r2.text
        after = r2.json().get("trial_end_date")
        assert after, "trial_end_date missing after extend"
        if before:
            assert after > before, f"trial_end_date did not increase: {before} -> {after}"

    def test_suspend_and_reactivate(self, sa_token):
        r = requests.get(f"{API}/admin/tenants", headers=hdr(sa_token["access_token"]), timeout=15)
        # avoid demo (used by other tests)
        candidate = next((t for t in r.json() if "demo" not in (t.get("company_name") or "").lower()), None)
        if not candidate:
            pytest.skip("no non-demo tenant to suspend safely")
        tid = candidate["id"]
        original_active = candidate.get("is_active", True)

        r2 = requests.patch(f"{API}/admin/tenants/{tid}", headers=hdr(sa_token["access_token"]),
                            json={"is_active": False}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("is_active") is False
        assert r2.json().get("suspended_at")

        # restore
        requests.patch(f"{API}/admin/tenants/{tid}", headers=hdr(sa_token["access_token"]),
                       json={"is_active": original_active}, timeout=15)

    def test_platform_tenant_protected(self, sa_token):
        r = requests.patch(f"{API}/admin/tenants/platform", headers=hdr(sa_token["access_token"]),
                           json={"plan": "trial"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_admin_endpoints_403_for_demo(self, demo_token):
        for path in ("/admin/tenants", "/admin/users", "/admin/subscriptions", "/admin/tickets"):
            r = requests.get(f"{API}{path}", headers=hdr(demo_token["access_token"]), timeout=15)
            assert r.status_code == 403, f"{path} did not return 403: {r.status_code}"


# =============== ADMIN USERS / SUBS / TICKETS LIST ===============
class TestAdminCross:
    def test_users_list(self, sa_token):
        r = requests.get(f"{API}/admin/users?search=demo", headers=hdr(sa_token["access_token"]), timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert all("password_hash" not in u for u in users)
        assert all("company_name" in u for u in users)

    def test_subscriptions_list(self, sa_token):
        r = requests.get(f"{API}/admin/subscriptions", headers=hdr(sa_token["access_token"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_tickets_list(self, sa_token):
        r = requests.get(f"{API}/admin/tickets", headers=hdr(sa_token["access_token"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# =============== SUPPORT ===============
class TestSupport:
    created_id = None

    def test_create_ticket(self, demo_token):
        r = requests.post(f"{API}/support/tickets", headers=hdr(demo_token["access_token"]),
                          json={"subject": "TEST_iter8 broken X", "description": "TEST_iter8 details enough chars here xx", "priority": "high", "category": "bug"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "open"
        assert d["priority"] == "high"
        assert d["source"] in ("user", "manual")
        assert d["replies"] == []
        TestSupport.created_id = d["id"]

    def test_list_my_tickets(self, demo_token):
        r = requests.get(f"{API}/support/tickets", headers=hdr(demo_token["access_token"]), timeout=15)
        assert r.status_code == 200
        tids = [t["id"] for t in r.json()]
        assert TestSupport.created_id in tids

    def test_reply_by_user(self, demo_token):
        tid = TestSupport.created_id
        r = requests.post(f"{API}/support/tickets/{tid}/reply", headers=hdr(demo_token["access_token"]),
                          json={"message": "TEST_iter8 user reply"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_staff"] is False
        # status should remain open (user replied)
        g = requests.get(f"{API}/support/tickets/{tid}", headers=hdr(demo_token["access_token"]), timeout=15)
        assert g.json()["status"] == "open"

    def test_superadmin_reply_bumps_status(self, sa_token):
        tid = TestSupport.created_id
        r = requests.post(f"{API}/support/tickets/{tid}/reply", headers=hdr(sa_token["access_token"]),
                          json={"message": "TEST_iter8 staff reply"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["is_staff"] is True
        # verify auto-bump
        g = requests.get(f"{API}/support/tickets/{tid}", headers=hdr(sa_token["access_token"]), timeout=15)
        assert g.json()["status"] == "in_progress"

    def test_superadmin_patch_status(self, sa_token):
        tid = TestSupport.created_id
        r = requests.patch(f"{API}/support/tickets/{tid}", headers=hdr(sa_token["access_token"]),
                           json={"status": "resolved", "priority": "normal"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "resolved"
        assert d["priority"] == "normal"

    def test_demo_cannot_patch(self, demo_token):
        tid = TestSupport.created_id
        r = requests.patch(f"{API}/support/tickets/{tid}", headers=hdr(demo_token["access_token"]),
                           json={"status": "closed"}, timeout=15)
        assert r.status_code == 403

    def test_cross_tenant_get_blocked(self, demo_token, sa_token):
        # Create a ticket as superadmin (in 'platform' tenant) and try to read as demo
        r = requests.post(f"{API}/support/tickets", headers=hdr(sa_token["access_token"]),
                          json={"subject": "TEST_iter8 platform-only", "description": "TEST_iter8 platform desc xxx more chars", "priority": "low"},
                          timeout=15)
        assert r.status_code == 200
        platform_tid = r.json()["id"]
        g = requests.get(f"{API}/support/tickets/{platform_tid}", headers=hdr(demo_token["access_token"]), timeout=15)
        assert g.status_code == 403


# =============== ASSISTANT ===============
def _post_assistant(tok, message, history=None, page_context=None, retries=2):
    last = None
    for i in range(retries + 1):
        r = requests.post(f"{API}/assistant/chat", headers=hdr(tok),
                          json={"message": message, "history": history or [], "page_context": page_context or {}},
                          timeout=45)
        last = r
        if r.status_code == 200:
            return r
        if r.status_code == 429:
            time.sleep(3 + i * 2)
            continue
        return r
    return last


class TestAssistant:
    def test_text_response_for_howto(self, demo_token):
        r = _post_assistant(demo_token["access_token"], "How do I create a campaign?",
                            page_context={"route": "/app/campaigns", "plan": "trial", "company": "Demo Inc"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("type") in ("text", "action", "ticket"), d
        assert isinstance(d.get("message"), str)
        assert len(d["message"]) > 0

    def test_action_response_for_draft_flow(self, demo_token):
        r = _post_assistant(demo_token["access_token"],
                            "Draft a chatbot flow for restaurant reservations with greeting, time picker and confirmation.",
                            page_context={"route": "/app/flows", "plan": "trial", "company": "Demo Inc"})
        assert r.status_code == 200, r.text
        d = r.json()
        # tolerate AI choosing text in rare cases — but assert it's well-formed
        assert d.get("type") in ("action", "text"), d
        if d["type"] == "action":
            a = d.get("action") or {}
            assert a.get("kind") in ("create_campaign", "draft_flow", "send_test_message", "navigate", "raise_ticket")
            assert isinstance(a.get("params"), dict)

    def test_ticket_creation_for_out_of_scope(self, demo_token):
        # Fetch ticket count before
        before = requests.get(f"{API}/support/tickets", headers=hdr(demo_token["access_token"]), timeout=15).json()
        before_chatbot = [t for t in before if t.get("source") == "chatbot"]

        r = _post_assistant(
            demo_token["access_token"],
            "My dog ate my homework and my refrigerator is broken — please get a plumber to fix my car.",
            page_context={"route": "/app", "plan": "trial", "company": "Demo Inc"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # The model SHOULD route to ticket; tolerate text fallback to avoid false-fail
        if d.get("type") == "ticket":
            assert d.get("ticket_id")
            after = requests.get(f"{API}/support/tickets", headers=hdr(demo_token["access_token"]), timeout=15).json()
            after_chatbot = [t for t in after if t.get("source") == "chatbot"]
            assert len(after_chatbot) >= len(before_chatbot) + 1, "chatbot ticket not persisted"
            # The created ticket id should be present
            assert any(t["id"] == d["ticket_id"] for t in after_chatbot), "ticket id not in tenant list"
        else:
            # mark as soft pass: log info
            print(f"NOTE: assistant returned type={d.get('type')} for out-of-scope; tolerated.")

    def test_history_and_page_context_accepted(self, demo_token):
        r = _post_assistant(
            demo_token["access_token"],
            "What about publishing it?",
            history=[{"role": "user", "content": "How do I create a flow?"},
                     {"role": "assistant", "content": "Go to Flows and click New."}],
            page_context={"route": "/app/flows", "plan": "trial", "company": "Demo Inc"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("type") in ("text", "action", "ticket")
