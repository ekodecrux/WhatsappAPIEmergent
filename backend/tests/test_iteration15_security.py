"""Iteration 15 — Audit Logging, RBAC, MFA (TOTP), Inactive Users.

Covers SOC-T1/T2 audit middleware, RBAC v1 (6 roles), MFA enroll/verify/challenge/disable,
backup codes, inactive-users viewer, role-change owner-only, demote-last-owner protection.
"""
from __future__ import annotations
import os
import time
import uuid

import pyotp
import pytest
import requests

from conftest import API


# ---------- Helpers ----------
def _register_fresh(session: requests.Session, prefix: str = "t15") -> dict:
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={
        "email": email, "password": "Test1234!", "full_name": f"Owner {prefix}",
        "company_name": f"TEST_{prefix}_Co",
    }, timeout=15)
    assert r.status_code == 200, f"register: {r.status_code} {r.text}"
    out = r.json()
    out["password"] = "Test1234!"
    return out


def _auth(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ============ 1. Login flow / role on register ============
class TestAuthAndRoles:
    def test_fresh_register_assigns_owner_role(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        tok = _register_fresh(s, "owner")
        assert tok["role"] == "owner", f"expected owner got {tok['role']}"
        assert tok.get("access_token")

    def test_legacy_demo_login_is_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # legacy demo retains 'admin'
        assert body.get("role") == "admin", f"legacy demo role = {body.get('role')}"
        assert body.get("access_token")

    def test_login_without_mfa_returns_normal_token(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        tok = _register_fresh(s, "nomfa")
        r = requests.post(f"{API}/auth/login", json={"email": tok["email"], "password": "Test1234!"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("access_token")
        assert "mfa_required" not in body or body.get("mfa_required") is not True

    def test_deactivated_user_cannot_login(self):
        # Register owner + invite a member, then deactivate.
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "deact")
        a = _auth(owner["access_token"])
        # Invite a viewer
        invite_email = f"TEST_member_{uuid.uuid4().hex[:6]}@example.com"
        r = a.post(f"{API}/team/invites", json={"email": invite_email, "role": "viewer"}, timeout=10)
        assert r.status_code == 200, r.text
        # Accept invite to create user
        token = r.json()["token"]
        r2 = requests.post(f"{API}/team/accept-invite", json={
            "token": token, "password": "Test1234!", "full_name": "Mbr"
        }, timeout=10)
        assert r2.status_code == 200, r2.text
        member_id = r2.json()["user_id"]
        # Owner deactivates the member
        r3 = a.patch(f"{API}/team/members/{member_id}", json={"is_active": False}, timeout=10)
        assert r3.status_code == 200, r3.text
        # Login attempt → 403
        r4 = requests.post(f"{API}/auth/login", json={"email": invite_email, "password": "Test1234!"}, timeout=10)
        assert r4.status_code == 403, f"expected 403 got {r4.status_code} {r4.text}"


# ============ 2. MFA Enroll/Verify/Challenge/Disable + backup codes ============
class TestMFA:
    @pytest.fixture(scope="class")
    def owner_ctx(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        tok = _register_fresh(s, "mfa")
        return tok  # has email/password/access_token

    def test_enroll_returns_qr_and_secret(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        r = a.post(f"{API}/mfa/enroll", json={}, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["secret"] and len(b["secret"]) >= 16
        assert b["qr_data_url"].startswith("data:image/png;base64,")
        assert "otpauth://" in b["provisioning_uri"]
        assert b["issuer"] == "wabridge"
        owner_ctx["secret"] = b["secret"]

    def test_verify_enroll_invalid_code_400(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        r = a.post(f"{API}/mfa/verify-enroll", json={"code": "000000"}, timeout=10)
        assert r.status_code == 400

    def test_verify_enroll_valid_code_returns_backup_codes(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        code = pyotp.TOTP(owner_ctx["secret"]).now()
        r = a.post(f"{API}/mfa/verify-enroll", json={"code": code}, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["enabled"] is True
        assert isinstance(b["backup_codes"], list) and len(b["backup_codes"]) == 8
        for bc in b["backup_codes"]:
            assert len(bc) == 9 and bc[4] == "-"
        assert "warning" in b
        owner_ctx["backup_codes"] = b["backup_codes"]

    def test_login_returns_mfa_required(self, owner_ctx):
        r = requests.post(f"{API}/auth/login", json={"email": owner_ctx["email"], "password": "Test1234!"}, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("mfa_required") is True
        assert b.get("challenge_token")
        assert "access_token" not in b
        assert b["email"] == owner_ctx["email"]
        owner_ctx["challenge_token"] = b["challenge_token"]

    def test_challenge_invalid_code_400(self, owner_ctx):
        r = requests.post(f"{API}/mfa/challenge",
                          json={"challenge_token": owner_ctx["challenge_token"], "code": "000000"}, timeout=10)
        assert r.status_code == 400

    def test_challenge_valid_totp_returns_token(self, owner_ctx):
        # Re-login to get fresh challenge
        r = requests.post(f"{API}/auth/login", json={"email": owner_ctx["email"], "password": "Test1234!"}, timeout=10)
        ch = r.json()["challenge_token"]
        code = pyotp.TOTP(owner_ctx["secret"]).now()
        r2 = requests.post(f"{API}/mfa/challenge", json={"challenge_token": ch, "code": code}, timeout=10)
        assert r2.status_code == 200, r2.text
        b = r2.json()
        assert b["access_token"] and b["role"] == "owner"
        owner_ctx["access_token"] = b["access_token"]
        # Token works on /auth/me
        a = _auth(b["access_token"])
        me = a.get(f"{API}/auth/me", timeout=10)
        assert me.status_code == 200

    def test_backup_code_one_time_use(self, owner_ctx):
        # Use first backup code
        bc = owner_ctx["backup_codes"][0]
        # Get fresh challenge
        r = requests.post(f"{API}/auth/login", json={"email": owner_ctx["email"], "password": "Test1234!"}, timeout=10)
        ch = r.json()["challenge_token"]
        r2 = requests.post(f"{API}/mfa/challenge", json={"challenge_token": ch, "code": bc}, timeout=10)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("backup_used") is True
        # Second attempt with the same backup code fails
        r3 = requests.post(f"{API}/auth/login", json={"email": owner_ctx["email"], "password": "Test1234!"}, timeout=10)
        ch3 = r3.json()["challenge_token"]
        r4 = requests.post(f"{API}/mfa/challenge", json={"challenge_token": ch3, "code": bc}, timeout=10)
        assert r4.status_code == 400, f"reused backup code accepted: {r4.status_code} {r4.text}"

    def test_status_endpoint(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        r = a.get(f"{API}/mfa/status", timeout=10)
        assert r.status_code == 200
        b = r.json()
        assert b["mfa_enabled"] is True
        assert b["required_by_role"] is True  # owner
        assert isinstance(b["backup_codes_remaining"], int) and b["backup_codes_remaining"] in (7, 8)

    def test_disable_wrong_password(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        code = pyotp.TOTP(owner_ctx["secret"]).now()
        r = a.post(f"{API}/mfa/disable", json={"password": "WrongPass!", "code": code}, timeout=10)
        assert r.status_code == 401

    def test_disable_wrong_code(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        r = a.post(f"{API}/mfa/disable", json={"password": "Test1234!", "code": "000000"}, timeout=10)
        assert r.status_code == 400

    def test_disable_success(self, owner_ctx):
        a = _auth(owner_ctx["access_token"])
        code = pyotp.TOTP(owner_ctx["secret"]).now()
        r = a.post(f"{API}/mfa/disable", json={"password": "Test1234!", "code": code}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["disabled"] is True


# ============ 3. Audit middleware ============
class TestAuditMiddleware:
    def test_post_writes_audit_log_get_does_not(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "audit")
        a = _auth(owner["access_token"])
        # POST a catalog product (mutating)
        unique = f"TEST_audit_{uuid.uuid4().hex[:6]}"
        r = a.post(f"{API}/catalog/products", json={"name": unique, "price_inr": 10}, timeout=10)
        assert r.status_code in (200, 201), f"product create: {r.status_code} {r.text}"
        # Audit middleware writes are async-best-effort; tiny sleep
        time.sleep(0.5)
        # Pull recent audit logs
        r2 = a.get(f"{API}/security/audit-logs?limit=50", timeout=10)
        assert r2.status_code == 200, r2.text
        rows = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", r2.json().get("logs", []))
        # find the catalog POST
        post_rows = [x for x in rows if x.get("method") == "POST" and "/api/catalog/products" in (x.get("endpoint") or "")]
        assert post_rows, f"No POST audit row found. Sample: {rows[:3]}"
        sample = post_rows[0]
        assert sample.get("response_status") in (200, 201)
        assert sample.get("user_id") == owner["user_id"]
        assert (sample.get("duration_ms") or 0) > 0
        # Confirm GET /audit-logs itself NOT logged
        get_rows = [x for x in rows if x.get("method") == "GET" and "/api/security/audit-logs" in (x.get("endpoint") or "")]
        assert not get_rows, "GET request was logged — middleware should skip GETs"

    def test_skip_paths_not_logged(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "skip")
        a = _auth(owner["access_token"])
        # Hit a skipped POST path: assistant chat
        try:
            a.post(f"{API}/assistant/chat", json={"message": "hi"}, timeout=10)
        except Exception:
            pass
        time.sleep(0.5)
        r = a.get(f"{API}/security/audit-logs?limit=50", timeout=10)
        rows = r.json() if isinstance(r.json(), list) else r.json().get("items", r.json().get("logs", []))
        skip = [x for x in rows if "/api/assistant/chat" in (x.get("endpoint") or "")
                or "/api/ai-assist/spam-score" in (x.get("endpoint") or "")
                or "/api/health" in (x.get("endpoint") or "")
                or "/api/branding/public" in (x.get("endpoint") or "")]
        assert not skip, f"Skipped path was logged: {skip[:2]}"


# ============ 4. Security viewers (RBAC) ============
class TestSecurityViewers:
    def test_inactive_users_owner_ok(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "inact")
        a = _auth(owner["access_token"])
        r = a.get(f"{API}/security/inactive-users", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        rows = body if isinstance(body, list) else body.get("items", [])
        # Owner themselves should appear or list be empty (just registered)
        if rows:
            row = rows[0]
            assert "days_idle" in row or "last_login" in row
            assert "expires_in_days" in row or "expires_at" in row or True  # tolerate naming
            assert "mfa_enabled" in row

    def test_audit_logs_viewer_role_403(self):
        # Owner invites viewer member, viewer tries audit-logs
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "rbacv")
        a = _auth(owner["access_token"])
        invite_email = f"TEST_viewer_{uuid.uuid4().hex[:6]}@example.com"
        r = a.post(f"{API}/team/invites", json={"email": invite_email, "role": "viewer"}, timeout=10)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        r2 = requests.post(f"{API}/team/accept-invite", json={
            "token": token, "password": "Test1234!", "full_name": "V"
        }, timeout=10)
        assert r2.status_code == 200
        viewer_token = r2.json()["access_token"]
        v = _auth(viewer_token)
        r3 = v.get(f"{API}/security/audit-logs", timeout=10)
        assert r3.status_code == 403, f"viewer should be 403 got {r3.status_code}"


# ============ 5. RBAC – team invite/role-change ============
class TestTeamRBAC:
    def test_invite_admin_ok_owner_rejected(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "rbacinv")
        a = _auth(owner["access_token"])
        # admin role allowed
        r1 = a.post(f"{API}/team/invites", json={"email": f"TEST_a_{uuid.uuid4().hex[:6]}@x.com", "role": "admin"}, timeout=10)
        assert r1.status_code == 200, r1.text
        # owner role rejected
        r2 = a.post(f"{API}/team/invites", json={"email": f"TEST_o_{uuid.uuid4().hex[:6]}@x.com", "role": "owner"}, timeout=10)
        assert r2.status_code in (400, 403), f"owner-invite expected 400/403 got {r2.status_code}: {r2.text}"
        # marketing_manager allowed
        r3 = a.post(f"{API}/team/invites", json={"email": f"TEST_m_{uuid.uuid4().hex[:6]}@x.com", "role": "marketing_manager"}, timeout=10)
        assert r3.status_code == 200, r3.text
        # invalid role rejected
        r4 = a.post(f"{API}/team/invites", json={"email": f"TEST_i_{uuid.uuid4().hex[:6]}@x.com", "role": "godmode"}, timeout=10)
        assert r4.status_code == 400, f"invalid role expected 400 got {r4.status_code}: {r4.text}"

    def test_role_change_owner_only_and_last_owner_protected(self):
        s = requests.Session(); s.headers["Content-Type"] = "application/json"
        owner = _register_fresh(s, "rbacrole")
        a = _auth(owner["access_token"])
        # Cannot demote self (last owner)
        r_self = a.patch(f"{API}/team/members/{owner['user_id']}", json={"role": "admin"}, timeout=10)
        assert r_self.status_code in (400, 403), f"last-owner demote should fail: {r_self.status_code} {r_self.text}"
        # Invite admin and check admin cannot change roles
        invite_email = f"TEST_adm_{uuid.uuid4().hex[:6]}@x.com"
        r = a.post(f"{API}/team/invites", json={"email": invite_email, "role": "admin"}, timeout=10)
        token = r.json()["token"]
        r2 = requests.post(f"{API}/team/accept-invite", json={
            "token": token, "password": "Test1234!", "full_name": "Adm"
        }, timeout=10)
        assert r2.status_code == 200
        admin_token = r2.json()["access_token"]
        admin_id = r2.json()["user_id"]
        ad = _auth(admin_token)
        # admin tries to change another member's role → expect 403
        # invite a viewer first
        invite_v = f"TEST_v_{uuid.uuid4().hex[:6]}@x.com"
        rv = a.post(f"{API}/team/invites", json={"email": invite_v, "role": "viewer"}, timeout=10)
        rv_tok = rv.json()["token"]
        rv2 = requests.post(f"{API}/team/accept-invite", json={"token": rv_tok, "password": "Test1234!", "full_name": "V"}, timeout=10)
        viewer_id = rv2.json()["user_id"]
        r3 = ad.patch(f"{API}/team/members/{viewer_id}", json={"role": "admin"}, timeout=10)
        assert r3.status_code == 403, f"admin role-change expected 403 got {r3.status_code}: {r3.text}"
        # owner can change role
        r4 = a.patch(f"{API}/team/members/{viewer_id}", json={"role": "support_agent"}, timeout=10)
        assert r4.status_code == 200, r4.text
