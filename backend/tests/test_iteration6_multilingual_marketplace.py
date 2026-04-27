"""Iteration 6: Multilingual flows + Marketplace + Delivery dashboard."""
import time
import pytest
import requests

# ============ helpers / fixtures ============


@pytest.fixture(scope="module")
def auth_headers(api_url):
    s = requests.Session()
    r = s.post(f"{api_url}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def draft_flow(api_url, auth_headers):
    """Create a flow with translatable text via lead_qualifier template."""
    r = requests.post(f"{api_url}/flows/from-template/lead_qualifier",
                      json={"name": f"TEST_iter6_lead_{int(time.time())}"},
                      headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    yield fid
    # cleanup
    try:
        requests.delete(f"{api_url}/flows/{fid}", headers=auth_headers, timeout=10)
    except Exception:
        pass


# ============ Multilingual: languages list + translate + CRUD ============

class TestMultilingual:
    def test_supported_languages(self, api_url, auth_headers):
        r = requests.get(f"{api_url}/flows/_languages", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        codes = {x["code"] for x in data}
        # Spec asks for 23 languages
        for c in ["en", "es", "hi", "fr", "de", "pt", "ar", "id", "vi", "zh", "ja", "ko", "ru", "tr", "it",
                  "ta", "te", "mr", "bn", "gu", "kn", "ml", "pa"]:
            assert c in codes, f"missing language {c}"
        assert len(codes) == 23

    def test_languages_route_before_fid(self, api_url, auth_headers):
        # Ensure /_languages is not interpreted as a flow id
        r = requests.get(f"{api_url}/flows/_languages", headers=auth_headers, timeout=10)
        assert r.status_code == 200

    def test_translate_rejects_same_default(self, api_url, auth_headers, draft_flow):
        r = requests.post(f"{api_url}/flows/{draft_flow}/translate",
                          json={"target_lang": "en"}, headers=auth_headers, timeout=20)
        assert r.status_code == 400

    def test_translate_rejects_unsupported(self, api_url, auth_headers, draft_flow):
        r = requests.post(f"{api_url}/flows/{draft_flow}/translate",
                          json={"target_lang": "xx"}, headers=auth_headers, timeout=20)
        assert r.status_code == 400

    def test_translate_to_spanish(self, api_url, auth_headers, draft_flow):
        r = requests.post(f"{api_url}/flows/{draft_flow}/translate",
                          json={"target_lang": "es"}, headers=auth_headers, timeout=60)
        if r.status_code in (500, 503):
            pytest.skip(f"Groq transient error: {r.text[:120]}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["language"] == "es"
        assert data["language_name"] == "Spanish"
        assert data["string_count"] >= 1
        assert isinstance(data["translations"], dict)
        # Verify persistence via list_translations
        r2 = requests.get(f"{api_url}/flows/{draft_flow}/translations",
                          headers=auth_headers, timeout=10)
        assert r2.status_code == 200
        avail = r2.json()
        assert avail["default_language"] == "en"
        assert any(a["code"] == "es" for a in avail["available"])

    def test_upsert_translation(self, api_url, auth_headers, draft_flow):
        # First create a hi translation manually
        r = requests.put(f"{api_url}/flows/{draft_flow}/translations/hi",
                         json={"translations": {"n2.prompt": "नमस्ते, आपका नाम क्या है?"}},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["language"] == "hi"
        assert body["updated"] >= 1

    def test_upsert_translation_unsupported_lang(self, api_url, auth_headers, draft_flow):
        r = requests.put(f"{api_url}/flows/{draft_flow}/translations/xx",
                         json={"translations": {"n2.prompt": "hi"}},
                         headers=auth_headers, timeout=10)
        assert r.status_code == 400

    def test_delete_translation(self, api_url, auth_headers, draft_flow):
        # Make sure hi exists from previous upsert test
        requests.put(f"{api_url}/flows/{draft_flow}/translations/hi",
                     json={"translations": {"n2.prompt": "x"}},
                     headers=auth_headers, timeout=10)
        r = requests.delete(f"{api_url}/flows/{draft_flow}/translations/hi",
                            headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["deleted"] is True
        # Verify removal
        r2 = requests.get(f"{api_url}/flows/{draft_flow}/translations",
                          headers=auth_headers, timeout=10)
        codes = {a["code"] for a in r2.json()["available"]}
        assert "hi" not in codes


# ============ Marketplace ============

class TestMarketplace:
    @pytest.fixture(scope="class")
    def published_template(self, api_url, auth_headers):
        # create a flow we can publish (lead qualifier has 5 nodes)
        r = requests.post(f"{api_url}/flows/from-template/lead_qualifier",
                          json={"name": f"TEST_iter6_pub_{int(time.time())}"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        # publish
        pr = requests.post(f"{api_url}/marketplace/publish/{fid}",
                           json={"name": "TEST_iter6 Lead Qualifier",
                                 "description": "A marketplace lead qualifier published for testing.",
                                 "category": "Sales",
                                 "tags": ["TEST_iter6", "lead", "qualifier"]},
                           headers=auth_headers, timeout=20)
        assert pr.status_code == 200, pr.text
        tpl = pr.json()
        yield {"fid": fid, "tpl_id": tpl["id"], "tpl": tpl}
        # cleanup
        requests.delete(f"{api_url}/marketplace/templates/{tpl['id']}", headers=auth_headers, timeout=10)
        requests.delete(f"{api_url}/flows/{fid}", headers=auth_headers, timeout=10)

    def test_publish_returns_no_tenant(self, published_template):
        tpl = published_template["tpl"]
        assert "author_tenant_id" not in tpl
        assert "author_user_id" not in tpl
        assert "id" in tpl and "author_name" in tpl

    def test_publish_rejects_short_description(self, api_url, auth_headers, published_template):
        fid = published_template["fid"]
        r = requests.post(f"{api_url}/marketplace/publish/{fid}",
                          json={"name": "X", "description": "short", "category": "Sales"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_publish_rejects_small_flow(self, api_url, auth_headers):
        # Create flow with only 1 node
        r = requests.post(f"{api_url}/flows", json={
            "name": f"TEST_iter6_tiny_{int(time.time())}",
            "nodes": [{"id": "n1", "type": "start", "data": {}, "position": {"x": 0, "y": 0}}],
            "edges": [],
        }, headers=auth_headers, timeout=10)
        assert r.status_code == 200
        fid = r.json()["id"]
        pr = requests.post(f"{api_url}/marketplace/publish/{fid}",
                           json={"name": "Tiny", "description": "A tiny flow that should fail to publish.",
                                 "category": "Sales"},
                           headers=auth_headers, timeout=10)
        assert pr.status_code == 400
        requests.delete(f"{api_url}/flows/{fid}", headers=auth_headers, timeout=10)

    def test_list_templates(self, api_url, auth_headers, published_template):
        r = requests.get(f"{api_url}/marketplace/templates", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        ours = [t for t in items if t["id"] == published_template["tpl_id"]]
        assert ours, "newly published template not in list"
        for t in items:
            assert "author_tenant_id" not in t
            assert "author_user_id" not in t

    def test_list_templates_search(self, api_url, auth_headers, published_template):
        r = requests.get(f"{api_url}/marketplace/templates?search=TEST_iter6",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(t["id"] == published_template["tpl_id"] for t in items)

    def test_list_templates_sort_popular(self, api_url, auth_headers):
        r = requests.get(f"{api_url}/marketplace/templates?sort=popular",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200

    def test_get_single_template(self, api_url, auth_headers, published_template):
        r = requests.get(f"{api_url}/marketplace/templates/{published_template['tpl_id']}",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200
        t = r.json()
        assert t["id"] == published_template["tpl_id"]
        assert "author_tenant_id" not in t

    def test_categories(self, api_url, auth_headers, published_template):
        r = requests.get(f"{api_url}/marketplace/categories", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list)
        assert "Sales" in cats

    def test_clone_template(self, api_url, auth_headers, published_template):
        before = requests.get(f"{api_url}/marketplace/templates/{published_template['tpl_id']}",
                              headers=auth_headers, timeout=10).json()
        before_dl = before.get("downloads", 0)

        r = requests.post(f"{api_url}/marketplace/templates/{published_template['tpl_id']}/clone",
                          json={}, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        flow = r.json()
        assert flow["status"] == "draft"
        assert flow["cloned_from_marketplace_id"] == published_template["tpl_id"]
        assert "_id" not in flow
        new_fid = flow["id"]

        # Verify GET returns the cloned flow
        gr = requests.get(f"{api_url}/flows/{new_fid}", headers=auth_headers, timeout=10)
        assert gr.status_code == 200

        # Verify downloads incremented
        after = requests.get(f"{api_url}/marketplace/templates/{published_template['tpl_id']}",
                             headers=auth_headers, timeout=10).json()
        assert after["downloads"] == before_dl + 1

        # cleanup cloned flow
        requests.delete(f"{api_url}/flows/{new_fid}", headers=auth_headers, timeout=10)

    def test_get_missing_template(self, api_url, auth_headers):
        r = requests.get(f"{api_url}/marketplace/templates/does-not-exist",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 404

    def test_delete_other_author_403(self, api_url, auth_headers, published_template):
        # Register a fresh tenant and try to delete demo's template
        import uuid
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        rr = s.post(f"{api_url}/auth/register", json={
            "email": email, "password": "Test1234!", "full_name": "X", "company_name": "X Co",
        }, timeout=15)
        assert rr.status_code == 200
        tok = rr.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r = requests.delete(f"{api_url}/marketplace/templates/{published_template['tpl_id']}",
                            headers=h, timeout=10)
        assert r.status_code == 403


# ============ Delivery dashboard ============

class TestDeliveryDashboard:
    def test_delivery_dashboard(self, api_url, auth_headers):
        r = requests.get(f"{api_url}/dashboard/delivery?days=7", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # totals
        for k in ("total", "delivered", "failed", "pending", "delivery_rate", "failure_rate"):
            assert k in data["totals"], f"missing totals.{k}"
        assert "status_counts" in data
        assert "trend" in data and isinstance(data["trend"], list) and len(data["trend"]) == 7
        for d in data["trend"]:
            for k in ("date", "sent", "delivered", "failed"):
                assert k in d
        assert "recent_failed" in data and isinstance(data["recent_failed"], list)
        assert "by_campaign" in data and isinstance(data["by_campaign"], list)

    def test_delivery_dashboard_unauth(self, api_url):
        r = requests.get(f"{api_url}/dashboard/delivery?days=7", timeout=10)
        assert r.status_code in (401, 403)


# ============ Auth on key endpoints ============

class TestAuth:
    def test_languages_unauth(self, api_url):
        r = requests.get(f"{api_url}/flows/_languages", timeout=10)
        assert r.status_code in (401, 403)

    def test_marketplace_list_unauth(self, api_url):
        r = requests.get(f"{api_url}/marketplace/templates", timeout=10)
        assert r.status_code in (401, 403)
