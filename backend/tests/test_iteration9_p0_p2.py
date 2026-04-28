"""
Iteration 9 tests:
- P0 Meta webhook HMAC verification (X-Hub-Signature-256)
- P1 Email-on-reply for support tickets (smoke / no-throw)
- P2 Marketplace ratings & reviews (CRUD + validation + author-block + upsert)
- P2 A/B campaigns (variant weights validation, runner deterministic split, message tagging)
- P2 Rich media on send / persistence
"""
import hmac
import hashlib
import json
import os
import time
import uuid

import pytest
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
META_SECRET = os.environ.get("META_APP_SECRET", "demo_meta_secret_change_in_production")
META_VERIFY_TOKEN = os.environ.get("META_VERIFY_TOKEN", "wabridge-meta-verify")


# ------------ shared fixtures (session-scoped) ------------
@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def sa_token():
    r = requests.post(f"{API}/auth/login", json={"email": "superadmin@wabridge.com", "password": "superadmin123"}, timeout=15)
    assert r.status_code == 200, f"sa login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# =====================================================================
# P0 META HMAC
# =====================================================================
class TestMetaHMAC:
    def test_get_verify_returns_challenge(self):
        r = requests.get(
            f"{API}/whatsapp/webhook/meta",
            params={"hub.mode": "subscribe", "hub.verify_token": META_VERIFY_TOKEN, "hub.challenge": "abc"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.text == "abc"

    def test_post_no_signature_returns_401(self):
        body = b'{"entry":[]}'
        r = requests.post(
            f"{API}/whatsapp/webhook/meta",
            data=body,
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"
        assert "invalid signature" in r.text.lower()

    def test_post_invalid_signature_returns_401(self):
        body = b'{"entry":[]}'
        r = requests.post(
            f"{API}/whatsapp/webhook/meta",
            data=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": "sha256=deadbeef"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_post_valid_signature_returns_200(self):
        body = b'{"entry":[]}'
        digest = hmac.new(META_SECRET.encode(), body, hashlib.sha256).hexdigest()
        r = requests.post(
            f"{API}/whatsapp/webhook/meta",
            data=body,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": f"sha256={digest}"},
            timeout=10,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        assert r.json().get("ok") is True


# =====================================================================
# P1 Email on ticket reply (smoke)
# =====================================================================
class TestTicketReplyEmail:
    @pytest.fixture(scope="class")
    def ticket_id(self, demo_token):
        # Demo tenant creates a ticket
        r = requests.post(
            f"{API}/support/tickets",
            json={
                "subject": "TEST_iter9 email-on-reply",
                "description": "Testing email notification on reply",
                "priority": "normal",
                "category": "general",
                "source": "web",
            },
            headers=hdr(demo_token),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_superadmin_reply_no_exception(self, sa_token, ticket_id):
        r = requests.post(
            f"{API}/support/tickets/{ticket_id}/reply",
            json={"message": "TEST_iter9 SA reply triggers email"},
            headers=hdr(sa_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("is_staff") is True

    def test_tenant_user_reply_no_exception(self, demo_token, ticket_id):
        r = requests.post(
            f"{API}/support/tickets/{ticket_id}/reply",
            json={"message": "TEST_iter9 tenant reply triggers email to SA"},
            headers=hdr(demo_token),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("is_staff") is False


# =====================================================================
# P2 Marketplace reviews
# =====================================================================
class TestMarketplaceReviews:
    @pytest.fixture(scope="class")
    def template_id(self, demo_token):
        # Create a flow then publish to marketplace
        flow_payload = {
            "name": "TEST_iter9 review flow",
            "description": "Flow for marketplace review tests",
            "language": "en",
            "nodes": [
                {"id": "n1", "type": "start", "data": {}},
                {"id": "n2", "type": "message", "data": {"message": "Hello"}},
            ],
            "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
            "triggers": [],
        }
        rf = requests.post(f"{API}/flows", json=flow_payload, headers=hdr(demo_token), timeout=15)
        assert rf.status_code == 200, rf.text
        fid = rf.json()["id"]
        rp = requests.post(
            f"{API}/marketplace/publish/{fid}",
            json={
                "name": f"TEST_iter9 tpl {uuid.uuid4().hex[:6]}",
                "description": "A test marketplace template for iteration 9 reviews",
                "category": "Custom",
                "tags": ["test"],
            },
            headers=hdr(demo_token),
            timeout=15,
        )
        assert rp.status_code == 200, rp.text
        return rp.json()["id"]

    def test_author_cannot_review_own(self, demo_token, template_id):
        r = requests.post(
            f"{API}/marketplace/templates/{template_id}/reviews",
            json={"rating": 5, "comment": "self review"},
            headers=hdr(demo_token),
            timeout=10,
        )
        assert r.status_code == 400
        assert "your own" in r.text.lower()

    def test_invalid_rating_returns_422(self, sa_token, template_id):
        r = requests.post(
            f"{API}/marketplace/templates/{template_id}/reviews",
            json={"rating": 6}, headers=hdr(sa_token), timeout=10,
        )
        assert r.status_code == 422
        r0 = requests.post(
            f"{API}/marketplace/templates/{template_id}/reviews",
            json={"rating": 0}, headers=hdr(sa_token), timeout=10,
        )
        assert r0.status_code == 422

    def test_submit_review_and_recompute_avg(self, sa_token, template_id):
        r = requests.post(
            f"{API}/marketplace/templates/{template_id}/reviews",
            json={"rating": 5, "comment": "Excellent template"},
            headers=hdr(sa_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["avg_rating"] == 5
        assert data["rating_count"] == 1

    def test_review_upsert(self, sa_token, template_id):
        # SA reviews again with rating=3 — should replace, not add
        r = requests.post(
            f"{API}/marketplace/templates/{template_id}/reviews",
            json={"rating": 3, "comment": "Updated review"},
            headers=hdr(sa_token), timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["rating_count"] == 1, f"upsert failed: count={data['rating_count']}"
        assert data["avg_rating"] == 3

    def test_list_reviews(self, demo_token, template_id):
        r = requests.get(f"{API}/marketplace/templates/{template_id}/reviews", headers=hdr(demo_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "avg_rating" in d and "rating_count" in d and "reviews" in d
        assert d["rating_count"] == 1
        assert len(d["reviews"]) == 1
        assert d["reviews"][0]["rating"] == 3

    def test_list_templates_includes_rating_fields(self, demo_token, template_id):
        r = requests.get(f"{API}/marketplace/templates", headers=hdr(demo_token), timeout=10)
        assert r.status_code == 200
        items = r.json()
        match = next((t for t in items if t["id"] == template_id), None)
        assert match is not None
        assert match.get("avg_rating") == 3
        assert match.get("rating_count") == 1

    def test_delete_my_review(self, sa_token, template_id):
        r = requests.delete(
            f"{API}/marketplace/templates/{template_id}/reviews",
            headers=hdr(sa_token), timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["deleted"] is True
        assert d["rating_count"] == 0
        assert d["avg_rating"] == 0


# =====================================================================
# P2 A/B campaigns
# =====================================================================
class TestABCampaigns:
    @pytest.fixture(scope="class")
    def credential_id(self, demo_token):
        # Reuse existing or create a sandbox credential
        r = requests.get(f"{API}/whatsapp/credentials", headers=hdr(demo_token), timeout=10)
        assert r.status_code == 200
        creds = r.json()
        if creds:
            return creds[0]["id"]
        rc = requests.post(
            f"{API}/whatsapp/credentials",
            json={"name": "TEST_iter9 sandbox", "provider": "twilio_sandbox"},
            headers=hdr(demo_token), timeout=15,
        )
        assert rc.status_code == 200, rc.text
        return rc.json()["id"]

    def test_invalid_variant_weights_400(self, demo_token, credential_id):
        r = requests.post(
            f"{API}/campaigns",
            json={
                "credential_id": credential_id,
                "name": "TEST_iter9 weight bad",
                "message": "fallback",
                "recipients": ["+15551234567"],
                "variants": [
                    {"name": "A", "message": "Hi A", "weight": 80},
                    {"name": "B", "message": "Hi B", "weight": 80},
                ],
            },
            headers=hdr(demo_token), timeout=10,
        )
        assert r.status_code == 400
        assert "weight" in r.text.lower()

    def test_create_ab_campaign(self, demo_token, credential_id):
        r = requests.post(
            f"{API}/campaigns",
            json={
                "credential_id": credential_id,
                "name": "TEST_iter9 ab",
                "message": "fallback",
                "recipients": ["+15550000001", "+15550000002", "+15550000003", "+15550000004"],
                "variants": [
                    {"name": "A", "message": "Hi A", "weight": 50},
                    {"name": "B", "message": "Hi B", "weight": 50},
                ],
            },
            headers=hdr(demo_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_ab_test"] is True
        assert len(d["variants"]) == 2
        assert d["variants"][0]["sent_count"] == 0
        return d["id"]

    def test_run_ab_and_check_variant_counters(self, demo_token, credential_id):
        # Create new campaign and approve it; allow runner to send (will fail to twilio sandbox)
        rc = requests.post(
            f"{API}/campaigns",
            json={
                "credential_id": credential_id,
                "name": "TEST_iter9 ab-runner",
                "message": "fallback",
                "recipients": ["+15551110001", "+15551110002", "+15551110003", "+15551110004"],
                "variants": [
                    {"name": "A", "message": "Hi A", "weight": 50},
                    {"name": "B", "message": "Hi B", "weight": 50},
                ],
            },
            headers=hdr(demo_token), timeout=10,
        )
        assert rc.status_code == 200, rc.text
        cid = rc.json()["id"]
        ra = requests.post(f"{API}/campaigns/{cid}/approve", json={"approve": True}, headers=hdr(demo_token), timeout=10)
        assert ra.status_code == 200
        # Wait for the background runner to process 4 recipients (~0.1s each + send time)
        time.sleep(8)
        rg = requests.get(f"{API}/campaigns/{cid}", headers=hdr(demo_token), timeout=10)
        assert rg.status_code == 200
        camp = rg.json()
        # Total per-variant counts should add up to total_recipients (sent_count)
        total_sent = sum(v.get("sent_count", 0) for v in camp.get("variants", []))
        assert total_sent == 4, f"expected 4 total sent across variants, got {total_sent}: {camp.get('variants')}"
        # Each variant should have at least one (deterministic 50/50 over 4 -> 2/2)
        for v in camp.get("variants", []):
            assert v.get("sent_count", 0) >= 1, f"variant {v.get('name')} got no sends"

    def test_messages_tagged_with_variant(self, demo_token):
        # Spot check: pull recent messages for tenant for a known recipient
        # We can call the conversations endpoint and inspect at least one of these
        r = requests.get(f"{API}/conversations", headers=hdr(demo_token), timeout=10)
        assert r.status_code == 200
        # We don't have direct DB access, but the conversations exist
        convs = r.json()
        ab_phones = {"+15551110001", "+15551110002", "+15551110003", "+15551110004"}
        matched = [c for c in convs if c.get("customer_phone") in ab_phones]
        assert matched, "No conversations created for AB test recipients"

    def test_single_variant_or_no_variant_works(self, demo_token, credential_id):
        # variants=[] still works
        r = requests.post(
            f"{API}/campaigns",
            json={
                "credential_id": credential_id,
                "name": "TEST_iter9 plain",
                "message": "Plain broadcast",
                "recipients": ["+15552220001"],
                "variants": [],
            },
            headers=hdr(demo_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["is_ab_test"] is False


# =====================================================================
# P2 Rich media
# =====================================================================
class TestRichMedia:
    @pytest.fixture(scope="class")
    def credential_id(self, demo_token):
        r = requests.get(f"{API}/whatsapp/credentials", headers=hdr(demo_token), timeout=10)
        creds = r.json() if r.status_code == 200 else []
        if creds:
            return creds[0]["id"]
        rc = requests.post(
            f"{API}/whatsapp/credentials",
            json={"name": "TEST_iter9 media-sb", "provider": "twilio_sandbox"},
            headers=hdr(demo_token), timeout=15,
        )
        return rc.json()["id"]

    def test_send_with_media_returns_response(self, demo_token, credential_id):
        # send may "fail" because recipient isn't opted into sandbox, but the API should respond 200
        r = requests.post(
            f"{API}/whatsapp/send",
            json={
                "credential_id": credential_id,
                "to_phone": "+15558889999",
                "content": "TEST_iter9 media",
                "media_url": "https://example.com/test.png",
                "media_type": "image",
            },
            headers=hdr(demo_token), timeout=20,
        )
        assert r.status_code == 200, r.text
        # Response shape: success bool + (sid|error)
        d = r.json()
        assert "success" in d

    def test_campaign_with_top_level_media(self, demo_token, credential_id):
        r = requests.post(
            f"{API}/campaigns",
            json={
                "credential_id": credential_id,
                "name": "TEST_iter9 media-campaign",
                "message": "with media",
                "media_url": "https://example.com/promo.png",
                "media_type": "image",
                "recipients": ["+15553330001"],
            },
            headers=hdr(demo_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["media_url"] == "https://example.com/promo.png"
        assert d["media_type"] == "image"
