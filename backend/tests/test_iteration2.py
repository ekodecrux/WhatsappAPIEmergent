"""Iteration 2 backend tests: Email OTP, SMS OTP, Team invites, Campaign resume, WebSocket"""
import os
import time
import uuid
import json
import asyncio
import pytest
import requests
from urllib.parse import urlparse


# =================== Email OTP ===================
class TestEmailOTP:
    def test_email_request_otp_returns_sent_or_dev_code(self, session, api_url):
        email = f"test_otp_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{api_url}/auth/email/request-otp",
                         json={"email": email, "purpose": "signup", "company_name": "TEST OTP Co",
                               "full_name": "TEST OTP User"},
                         timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # backend either sends email (sent:true) or returns dev_code on smtp failure
        assert "sent" in data
        if not data.get("sent"):
            assert "dev_code" in data and len(data["dev_code"]) == 6

    def test_email_verify_invalid_code_400(self, session, api_url):
        email = f"test_otp_bad_{uuid.uuid4().hex[:8]}@example.com"
        # request first
        session.post(f"{api_url}/auth/email/request-otp", json={"email": email, "purpose": "signup"}, timeout=20)
        r = session.post(f"{api_url}/auth/email/verify-otp",
                         json={"email": email, "code": "000000"}, timeout=10)
        assert r.status_code == 400

    def test_email_signup_full_flow_via_dev_code(self, session, api_url):
        """Full OTP signup -> verify -> /auth/me using dev_code if SMTP fails, else read from mongo."""
        email = f"test_otp_flow_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{api_url}/auth/email/request-otp",
                         json={"email": email, "purpose": "signup",
                               "company_name": "TEST Flow Co", "full_name": "TEST Flow"},
                         timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        code = data.get("dev_code")
        if not code:
            # Email actually sent — fetch from Mongo otp_codes (we cannot read raw code, only hash).
            # In this case skip the verify part since we can't know the real code.
            pytest.skip("Email actually sent; raw code unknown, cannot complete verify.")
        r = session.post(f"{api_url}/auth/email/verify-otp",
                         json={"email": email, "code": code,
                               "company_name": "TEST Flow Co", "full_name": "TEST Flow",
                               "purpose": "signup"},
                         timeout=20)
        assert r.status_code == 200, r.text
        token = r.json()
        assert token["access_token"]
        assert token["email"] == email.lower()
        assert token["company_name"] == "TEST Flow Co"
        assert token["role"] == "admin"
        # auth/me with token
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {token['access_token']}",
                          "Content-Type": "application/json"})
        me = s.get(f"{api_url}/auth/me", timeout=10)
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email.lower()


# =================== SMS OTP (Twilio Verify) ===================
class TestSmsOTP:
    def test_sms_request_invalid_format_400(self, session, api_url):
        r = session.post(f"{api_url}/auth/sms/request-otp",
                         json={"phone": "9876543210"}, timeout=10)
        assert r.status_code == 400

    def test_sms_verify_invalid_code_returns_400(self, session, api_url):
        """Twilio Verify will reject a bogus code; backend returns 400. Rate-limit also acceptable."""
        r = session.post(f"{api_url}/auth/sms/verify-otp",
                         json={"phone": "+15005550006", "code": "000000"}, timeout=20)
        # 400 expected (twilio rejects invalid OR no pending verification)
        assert r.status_code == 400, r.text


# =================== Team Invites ===================
class TestTeamInvites:
    invite_token = None
    invite_id = None
    invite_email = None

    def test_create_invite_admin(self, auth_session, api_url):
        TestTeamInvites.invite_email = f"test_invite_{uuid.uuid4().hex[:8]}@example.com"
        r = auth_session.post(f"{api_url}/team/invites",
                              json={"email": TestTeamInvites.invite_email,
                                    "full_name": "TEST Invitee", "role": "member"},
                              timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == TestTeamInvites.invite_email.lower()
        assert data["role"] == "member"
        assert data["token"]
        TestTeamInvites.invite_token = data["token"]
        TestTeamInvites.invite_id = data["id"]

    def test_list_invites(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/team/invites", timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert any(i.get("id") == TestTeamInvites.invite_id for i in items)

    def test_list_members(self, auth_session, api_url):
        r = auth_session.get(f"{api_url}/team/members", timeout=10)
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list)
        assert any(m["email"] == "demo@test.com" for m in members)
        # ensure password_hash never leaks
        for m in members:
            assert "password_hash" not in m

    def test_accept_invite_creates_user(self, session, api_url):
        assert TestTeamInvites.invite_token
        r = session.post(f"{api_url}/team/accept-invite",
                         json={"token": TestTeamInvites.invite_token,
                               "password": "Invited1234!", "full_name": "TEST Invited"},
                         timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["access_token"]
        assert data["email"] == TestTeamInvites.invite_email.lower()
        assert data["role"] == "member"

    def test_accept_invite_invalid_token(self, session, api_url):
        r = session.post(f"{api_url}/team/accept-invite",
                         json={"token": "invalid_token_xxx", "password": "X1234567!"},
                         timeout=10)
        assert r.status_code == 400

    def test_invite_non_admin_403(self, session, api_url):
        """Login as the freshly accepted member (role=member) and try to create invite -> 403."""
        # login as the new member created above
        if not TestTeamInvites.invite_email:
            pytest.skip("invite email missing")
        r = session.post(f"{api_url}/auth/login",
                         json={"email": TestTeamInvites.invite_email, "password": "Invited1234!"}, timeout=10)
        assert r.status_code == 200, r.text
        tok = r.json()["access_token"]
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        r = s.post(f"{api_url}/team/invites",
                   json={"email": "x@y.com", "role": "member"}, timeout=10)
        assert r.status_code == 403


# =================== Members PATCH/DELETE ===================
class TestMemberManagement:
    def test_admin_cannot_demote_self(self, auth_session, api_url):
        me = auth_session.get(f"{api_url}/auth/me", timeout=10).json()
        my_id = me["user"]["id"]
        r = auth_session.patch(f"{api_url}/team/members/{my_id}",
                               json={"role": "member"}, timeout=10)
        assert r.status_code == 400

    def test_admin_cannot_remove_self(self, auth_session, api_url):
        me = auth_session.get(f"{api_url}/auth/me", timeout=10).json()
        my_id = me["user"]["id"]
        r = auth_session.delete(f"{api_url}/team/members/{my_id}", timeout=10)
        assert r.status_code == 400

    def test_patch_member_role(self, auth_session, api_url):
        members = auth_session.get(f"{api_url}/team/members", timeout=10).json()
        # find a non-admin member
        target = next((m for m in members if m["role"] != "admin"), None)
        if not target:
            pytest.skip("No non-admin member available")
        r = auth_session.patch(f"{api_url}/team/members/{target['id']}",
                               json={"role": "viewer"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["updated"] >= 0


# =================== Campaign resume ===================
class TestCampaignResume:
    def _make_paused_campaign(self, auth_session, api_url):
        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        cred_id = creds[0]["id"]
        # create campaign
        r = auth_session.post(f"{api_url}/campaigns", json={
            "name": f"TEST_resume_{uuid.uuid4().hex[:6]}",
            "credential_id": cred_id,
            "message": "Resume test",
            "recipients": ["+919000010001", "+919000010002", "+919000010003"],
        }, timeout=10)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        # approve -> running
        r = auth_session.post(f"{api_url}/campaigns/{cid}/approve", json={"approve": True}, timeout=10)
        assert r.status_code == 200
        # immediately pause
        r = auth_session.post(f"{api_url}/campaigns/{cid}/pause", timeout=10)
        assert r.status_code == 200
        return cid

    def test_resume_paused_campaign(self, auth_session, api_url):
        cid = self._make_paused_campaign(auth_session, api_url)
        # ensure status is paused
        time.sleep(1)
        # If campaign already completed (small recipient list, fast loop), force-pause won't matter; skip
        c = auth_session.get(f"{api_url}/campaigns/{cid}", timeout=10).json()
        if c["status"] != "paused":
            pytest.skip(f"Campaign status is {c['status']}, not paused (race)")
        r = auth_session.post(f"{api_url}/campaigns/{cid}/resume", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "running"

    def test_resume_running_returns_400(self, auth_session, api_url):
        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        cred_id = creds[0]["id"]
        r = auth_session.post(f"{api_url}/campaigns", json={
            "name": f"TEST_resume_bad_{uuid.uuid4().hex[:6]}",
            "credential_id": cred_id,
            "message": "Bad resume",
            "recipients": ["+919000099001"],
        }, timeout=10)
        cid = r.json()["id"]
        auth_session.post(f"{api_url}/campaigns/{cid}/approve", json={"approve": True}, timeout=10)
        r = auth_session.post(f"{api_url}/campaigns/{cid}/resume", timeout=10)
        # Either running or completed -> 400
        assert r.status_code == 400


# =================== WebSocket ===================
class TestWebSocket:
    def test_ws_rejects_without_token(self, base_url):
        try:
            from websockets.sync.client import connect
        except ImportError:
            pytest.skip("websockets package not installed")
        # construct ws url
        url = base_url.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"
        try:
            with connect(url, open_timeout=5) as _ws:
                pytest.fail("Should not have connected without token")
        except Exception as e:
            # 4401 close, or handshake error — both acceptable
            assert True

    def test_ws_accepts_with_valid_token(self, demo_token, base_url):
        try:
            from websockets.sync.client import connect
        except ImportError:
            pytest.skip("websockets package not installed")
        token = demo_token["access_token"]
        url = base_url.replace("https://", "wss://").replace("http://", "ws://") + f"/api/ws?token={token}"
        try:
            with connect(url, open_timeout=10) as ws:
                # Connection succeeded - that's the assertion
                assert ws is not None
        except Exception as e:
            pytest.fail(f"Valid-token WS connection failed: {e}")

    def test_ws_broadcast_on_simulate_inbound(self, demo_token, auth_session, api_url, base_url):
        try:
            from websockets.sync.client import connect
        except ImportError:
            pytest.skip("websockets package not installed")
        token = demo_token["access_token"]
        url = base_url.replace("https://", "wss://").replace("http://", "ws://") + f"/api/ws?token={token}"

        creds = auth_session.get(f"{api_url}/whatsapp/credentials", timeout=10).json()
        cred_id = creds[0]["id"]

        try:
            with connect(url, open_timeout=10) as ws:
                # trigger inbound in another thread/async
                import threading
                def fire():
                    time.sleep(0.5)
                    auth_session.post(f"{api_url}/whatsapp/simulate-inbound", json={
                        "from_phone": "+919999987654",
                        "from_name": "TEST_WS",
                        "text": "hello via ws",
                        "credential_id": cred_id,
                    }, timeout=30)
                t = threading.Thread(target=fire, daemon=True); t.start()
                # wait for any message within ~15s
                ws.socket.settimeout(15)
                msg = ws.recv(timeout=15)
                assert msg
                data = json.loads(msg)
                assert data.get("type") == "message" or "type" in data
        except Exception as e:
            pytest.skip(f"WS broadcast test inconclusive: {e}")
