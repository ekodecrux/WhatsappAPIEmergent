import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_url():
    return API


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    """Login with seeded demo user. Fallback: register a new tenant."""
    r = session.post(f"{API}/auth/login", json={"email": "demo@test.com", "password": "demo1234"}, timeout=15)
    if r.status_code == 200:
        return r.json()
    # fallback: register fresh
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={
        "email": email, "password": "Test1234!", "full_name": "Test User", "company_name": "Test Co",
    }, timeout=15)
    assert r.status_code == 200, f"Register fallback failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def auth_session(session, demo_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {demo_token['access_token']}",
    })
    return s
