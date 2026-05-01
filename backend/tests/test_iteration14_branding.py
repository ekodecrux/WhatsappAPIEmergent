"""Iteration 14: Custom Domain Mapping & Tenant Branding tests.

Covers:
- GET /api/branding
- PATCH /api/branding (partial update + hex validation)
- POST /api/branding/domains (create, 400 on bad host, 409 on duplicate)
- POST /api/branding/domains/{id}/verify (unverified DNS path)
- DELETE /api/branding/domains/{id}
- GET /api/branding/public?host=... (unauthenticated, matched:false for unknown)
- GET /api/branding/admin/all (403 for tenant admin, 200 for superadmin)
- POST /api/branding/admin/{id}/revoke (superadmin only)
"""
import os
import uuid
import requests
import pytest
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def tenant_sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.text}"
    tok = r.json()["access_token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": "superadmin@wabridge.com", "password": "superadmin123"}, timeout=15)
    assert r.status_code == 200, f"superadmin login failed: {r.text}"
    tok = r.json()["access_token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


# ---------- GET / PATCH /api/branding ----------
class TestBrandingCRUD:
    def test_get_branding_default(self, tenant_sess):
        r = tenant_sess.get(f"{API}/branding", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "branding" in data
        assert "domains" in data and isinstance(data["domains"], list)
        assert "cname_target" in data and isinstance(data["cname_target"], str) and len(data["cname_target"]) > 3

    def test_patch_branding_persists(self, tenant_sess):
        payload = {
            "brand_name": "TEST_Brand",
            "primary_color": "#16A34A",
            "login_hero_text": "TEST hero text",
            "custom_css": "/* TEST css */",
        }
        r = tenant_sess.patch(f"{API}/branding", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()["branding"]
        assert b.get("brand_name") == "TEST_Brand"
        assert b.get("primary_color") == "#16A34A"
        # Reread to verify persistence
        r2 = tenant_sess.get(f"{API}/branding", timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()["branding"]
        assert b2.get("brand_name") == "TEST_Brand"
        assert b2.get("login_hero_text") == "TEST hero text"

    def test_patch_rejects_bad_hex(self, tenant_sess):
        r = tenant_sess.patch(f"{API}/branding", json={"primary_color": "not-a-hex"}, timeout=15)
        assert r.status_code == 400
        assert "primary_color" in r.text

    def test_patch_empty_body_400(self, tenant_sess):
        r = tenant_sess.patch(f"{API}/branding", json={}, timeout=15)
        assert r.status_code == 400


# ---------- Custom Domain lifecycle ----------
class TestDomains:
    def test_add_invalid_hostname_400(self, tenant_sess):
        r = tenant_sess.post(f"{API}/branding/domains", json={"hostname": "not a domain"}, timeout=15)
        assert r.status_code == 400

    def test_add_verify_delete_domain_flow(self, tenant_sess):
        host = f"test-{uuid.uuid4().hex[:8]}.example.com"
        # Create
        r = tenant_sess.post(f"{API}/branding/domains", json={"hostname": host}, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["hostname"] == host
        assert doc["status"] == "pending"
        assert doc["txt_token"].startswith("wabridge-verify=")
        assert doc["cname_target"]
        did = doc["id"]

        # Duplicate → 409
        r2 = tenant_sess.post(f"{API}/branding/domains", json={"hostname": host}, timeout=15)
        assert r2.status_code == 409

        # Verify (will fail because TXT record does not exist)
        rv = tenant_sess.post(f"{API}/branding/domains/{did}/verify", timeout=20)
        assert rv.status_code == 200, rv.text
        vdata = rv.json()
        assert vdata["verified"] is False
        assert "expected_txt_record" in vdata
        assert vdata["expected_txt_record"] == doc["txt_token"]
        assert vdata["expected_host"] == f"_wabridge.{host}"

        # List via GET
        r3 = tenant_sess.get(f"{API}/branding", timeout=15)
        assert r3.status_code == 200
        domains = r3.json()["domains"]
        assert any(d["id"] == did for d in domains)

        # Delete
        rd = tenant_sess.delete(f"{API}/branding/domains/{did}", timeout=15)
        assert rd.status_code == 200
        assert rd.json().get("deleted") is True


# ---------- Public lookup (UNAUTHENTICATED) ----------
class TestPublicLookup:
    def test_public_lookup_no_auth_unknown_host(self):
        # Fresh session with NO Authorization header
        s = requests.Session()
        unknown = f"nope-{uuid.uuid4().hex[:8]}.example.net"
        r = s.get(f"{API}/branding/public", params={"host": unknown}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("matched") is False
        assert data.get("branding") is None

    def test_public_lookup_strips_port_and_protocol(self):
        s = requests.Session()
        r = s.get(f"{API}/branding/public", params={"host": "http://random.example.com:8080/"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("matched") is False


# ---------- Super admin oversight ----------
class TestSuperAdmin:
    def test_tenant_admin_forbidden(self, tenant_sess):
        r = tenant_sess.get(f"{API}/branding/admin/all", timeout=15)
        assert r.status_code == 403

    def test_superadmin_can_list(self, super_sess):
        r = super_sess.get(f"{API}/branding/admin/all", timeout=15)
        assert r.status_code == 200, r.text
        lst = r.json()
        assert isinstance(lst, list)
        # Each entry should include enriched fields if there are any rows
        for d in lst:
            assert "tenant_id" in d
            assert "tenant_name" in d
            assert "tenant_plan" in d

    def test_superadmin_revoke_flow(self, tenant_sess, super_sess):
        # Tenant creates a domain
        host = f"revoke-{uuid.uuid4().hex[:8]}.example.com"
        r = tenant_sess.post(f"{API}/branding/domains", json={"hostname": host}, timeout=15)
        assert r.status_code == 200
        did = r.json()["id"]

        # Super admin revokes
        rr = super_sess.post(f"{API}/branding/admin/{did}/revoke", json={"reason": "TEST abuse"}, timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json().get("revoked") is True

        # Confirm status on tenant side
        rg = tenant_sess.get(f"{API}/branding", timeout=15)
        assert rg.status_code == 200
        found = [d for d in rg.json()["domains"] if d["id"] == did]
        assert found, "Revoked domain missing from tenant list"
        assert found[0]["status"] == "revoked"
        assert found[0].get("revoke_reason") == "TEST abuse"

        # cleanup
        tenant_sess.delete(f"{API}/branding/domains/{did}", timeout=15)

    def test_tenant_cannot_revoke(self, tenant_sess):
        r = tenant_sess.post(f"{API}/branding/admin/nonexistent-id/revoke", json={"reason": "x"}, timeout=15)
        assert r.status_code == 403
