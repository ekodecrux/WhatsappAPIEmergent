"""SOC-T1 + SOC-T2 — Audit Logging Middleware (no body capture, safer for PII).

Captures every mutating /api/* request:
  {user_id, tenant_id, method, endpoint, query, status, duration_ms, ip, ua, ts}

Does NOT hash the request body — intentional: request body may contain PII (phones,
emails, message content) and logging a hash adds negligible value while the full
content lives in MongoDB anyway. For forensics, the combination of
(tenant_id, user_id, endpoint, timestamp) is sufficient to find the side-effect record.

Skips:
  - non-/api/* paths
  - read-only methods (GET/HEAD/OPTIONS)
  - high-volume polling endpoints (ai-assist, assistant chat, ws, branding/public, health)
"""
from __future__ import annotations
import os
import time
from datetime import datetime, timezone

import jwt as _jwt
from starlette.types import ASGIApp, Receive, Scope, Send


LOG_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
SKIP_SUBPATHS = (
    "/api/ai-assist/spam-score",
    "/api/ai-assist/reply-coach",
    "/api/assistant/chat",
    "/api/ws",
    "/api/branding/public",
    "/api/health",
)


def _decode_user_tenant(auth_header: str | None) -> tuple[str | None, str | None]:
    if not auth_header:
        return None, None
    parts = auth_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None, None
    try:
        payload = _jwt.decode(
            parts[1],
            os.environ["JWT_SECRET"],
            algorithms=[os.environ.get("JWT_ALGORITHM", "HS256")],
        )
        return payload.get("sub"), payload.get("tid")
    except Exception:
        return None, None


class AuditLogMiddleware:
    """Pure ASGI middleware — does not subclass BaseHTTPMiddleware (avoids body-consumption bugs)."""

    def __init__(self, app: ASGIApp, db):
        self.app = app
        self._db = db

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        method: str = scope.get("method", "GET")

        should_log = (
            path.startswith("/api/")
            and method in LOG_METHODS
            and not any(path.startswith(s) for s in SKIP_SUBPATHS)
        )

        if not should_log:
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = {"value": 0}

        # Extract auth header
        auth_header = None
        for k, v in scope.get("headers", []):
            if k == b"authorization":
                try:
                    auth_header = v.decode("latin-1")
                except Exception:
                    auth_header = None
                break
        user_id, tenant_id = _decode_user_tenant(auth_header)

        # Client IP + UA
        client_ip = ""
        if scope.get("client"):
            client_ip = scope["client"][0]
        user_agent = ""
        for k, v in scope.get("headers", []):
            if k == b"user-agent":
                try:
                    user_agent = v.decode("latin-1")[:300]
                except Exception:
                    user_agent = ""
                break

        async def _send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code["value"] = message.get("status", 0)
            await send(message)

        try:
            await self.app(scope, receive, _send_wrapper)
        finally:
            try:
                await self._db.audit_logs.insert_one({
                    "type": "http",
                    "user_id": user_id,
                    "tenant_id": tenant_id or "anonymous",
                    "method": method,
                    "endpoint": path,
                    "query": (scope.get("query_string", b"") or b"").decode("latin-1"),
                    "response_status": status_code["value"],
                    "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                    "ip_address": client_ip,
                    "user_agent": user_agent,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "created_at_dt": datetime.now(timezone.utc),
                })
            except Exception:
                # Never let logging break the request path
                pass
