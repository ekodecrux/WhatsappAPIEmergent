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
