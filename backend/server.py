"""WhatsApp SaaS Platform - FastAPI Backend Entry"""
import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import jwt as _jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("wa-saas")

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.tenants.create_index("id", unique=True)
    await db.whatsapp_credentials.create_index([("tenant_id", 1), ("name", 1)])
    await db.campaigns.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.leads.create_index([("tenant_id", 1), ("phone", 1)], unique=True)
    await db.conversations.create_index([("tenant_id", 1), ("customer_phone", 1)], unique=True)
    await db.messages.create_index([("conversation_id", 1), ("sent_at", -1)])
    await db.auto_reply_rules.create_index([("tenant_id", 1)])
    await db.templates.create_index([("tenant_id", 1)])
    await db.api_keys.create_index("key_hash", unique=True)
    await db.audit_logs.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.marketplace_templates.create_index([("created_at", -1)])
    await db.marketplace_templates.create_index([("downloads", -1)])
    await db.marketplace_templates.create_index([("category", 1)])
    await db.support_tickets.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.support_tickets.create_index([("status", 1), ("priority", 1)])
    await db.wallet_transactions.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.wallet_transactions.create_index([("type", 1), ("created_at", -1)])
    await db.erp_webhooks.create_index([("tenant_id", 1), ("is_active", 1)])
    await db.webhook_deliveries.create_index([("webhook_id", 1), ("attempted_at", -1)])
    await db.webhook_deliveries.create_index([("tenant_id", 1), ("attempted_at", -1)])
    await db.api_key_usage.create_index([("key_hash", 1), ("bucket", 1)], unique=True)
    await db.api_key_usage.create_index([("bucket", 1)], expireAfterSeconds=300)

    # Seed superadmin user (idempotent)
    try:
        from helpers import hash_password
        from models import uid as _uid
        from datetime import datetime as _dt, timezone as _tz
        sa_email = os.environ.get("SUPERADMIN_EMAIL", "superadmin@wabridge.com")
        sa_password = os.environ.get("SUPERADMIN_PASSWORD", "superadmin123")
        existing = await db.users.find_one({"email": sa_email.lower()})
        if not existing:
            # Create a platform tenant for the super admin
            platform_tenant_id = "platform"
            if not await db.tenants.find_one({"id": platform_tenant_id}):
                await db.tenants.insert_one({
                    "id": platform_tenant_id,
                    "company_name": "Platform Admin",
                    "plan": "enterprise",
                    "is_active": True,
                    "is_platform": True,
                    "created_at": _dt.now(_tz.utc).isoformat(),
                })
            await db.users.insert_one({
                "id": _uid(),
                "tenant_id": platform_tenant_id,
                "email": sa_email.lower(),
                "password_hash": hash_password(sa_password),
                "full_name": "Super Admin",
                "role": "admin",
                "is_superadmin": True,
                "is_active": True,
                "created_at": _dt.now(_tz.utc).isoformat(),
            })
            logger.info("Seeded superadmin: %s", sa_email)
        elif not existing.get("is_superadmin"):
            await db.users.update_one({"email": sa_email.lower()}, {"$set": {"is_superadmin": True}})
            logger.info("Elevated existing user to superadmin: %s", sa_email)
    except Exception as e:
        logger.warning("Superadmin seed skipped: %s", e)

    logger.info("WhatsApp SaaS started. DB: %s", os.environ["DB_NAME"])
    yield
    client.close()


app = FastAPI(title="WhatsApp Marketing Platform", lifespan=lifespan)


api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"name": "WhatsApp SaaS API", "version": "1.0.0", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


# Import routes after db is set up to avoid circular issues
from routers import auth as r_auth  # noqa: E402
from routers import otp as r_otp  # noqa: E402
from routers import whatsapp as r_whatsapp  # noqa: E402
from routers import campaigns as r_campaigns  # noqa: E402
from routers import chat as r_chat  # noqa: E402
from routers import billing as r_billing  # noqa: E402
from routers import integrations as r_integrations  # noqa: E402
from routers import dashboard as r_dashboard  # noqa: E402
from routers import team as r_team  # noqa: E402
from routers import flows as r_flows  # noqa: E402
from routers import marketplace as r_marketplace  # noqa: E402
from routers import admin as r_admin  # noqa: E402
from routers import support as r_support  # noqa: E402
from routers import assistant as r_assistant  # noqa: E402
from routers import wallet as r_wallet  # noqa: E402
from routers import admin_analytics as r_admin_analytics  # noqa: E402

api_router.include_router(r_auth.router)
api_router.include_router(r_otp.router)
api_router.include_router(r_whatsapp.router)
api_router.include_router(r_campaigns.router)
api_router.include_router(r_chat.router)
api_router.include_router(r_billing.router)
api_router.include_router(r_integrations.router)
api_router.include_router(r_dashboard.router)
api_router.include_router(r_team.router)
api_router.include_router(r_flows.router)
api_router.include_router(r_marketplace.router)
api_router.include_router(r_admin.router)
api_router.include_router(r_support.router)
api_router.include_router(r_assistant.router)
api_router.include_router(r_wallet.router)
api_router.include_router(r_admin_analytics.router)

app.include_router(api_router)


# ===== WebSocket for real-time chat =====
from ws_manager import ws_manager  # noqa: E402


@app.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket, token: str = Query(...)):
    """Authenticate via ?token=<jwt>, then join tenant room. Server broadcasts chat events."""
    try:
        payload = _jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[os.environ.get("JWT_ALGORITHM", "HS256")])
        tenant_id = payload.get("tid")
        if not tenant_id:
            await websocket.close(code=4401)
            return
    except Exception:
        await websocket.close(code=4401)
        return

    await ws_manager.connect(websocket, tenant_id)
    try:
        while True:
            # client may send pings; we ignore content
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, tenant_id)
    except Exception:
        ws_manager.disconnect(websocket, tenant_id)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
