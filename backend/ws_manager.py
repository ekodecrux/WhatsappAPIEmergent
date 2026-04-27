"""WebSocket connection manager for real-time chat updates"""
from typing import Dict, Set
import json
from fastapi import WebSocket


class WSManager:
    def __init__(self):
        # tenant_id -> set of websockets
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, tenant_id: str):
        await ws.accept()
        self.connections.setdefault(tenant_id, set()).add(ws)

    def disconnect(self, ws: WebSocket, tenant_id: str):
        if tenant_id in self.connections:
            self.connections[tenant_id].discard(ws)
            if not self.connections[tenant_id]:
                self.connections.pop(tenant_id, None)

    async def broadcast(self, tenant_id: str, payload: dict):
        if tenant_id not in self.connections:
            return
        dead = []
        for ws in list(self.connections[tenant_id]):
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[tenant_id].discard(ws)


ws_manager = WSManager()
