"""
Central event dispatcher and WebSocket connection manager.

Handles event persistence, changed-file tracking, and real-time
broadcasting to connected WebSocket clients.
"""

import json
from fastapi import WebSocket

import database


class ConnectionManager:
    """Manages WebSocket connections grouped by session_id."""

    def __init__(self):
        # session_id -> list of WebSocket connections
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        """Send a JSON message to all clients subscribed to a session."""
        if session_id in self.active_connections:
            dead = []
            for ws in self.active_connections[session_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(session_id, ws)


# Singleton instance
manager = ConnectionManager()


async def emit(session_id: str, event_type: str, payload: dict) -> dict:
    """
    Persist an event, track changed files, and broadcast to WebSocket clients.

    Args:
        session_id: The session this event belongs to.
        event_type: One of 'message', 'terminal', 'file_changed', 'activity', 'status', 'error'.
        payload: Event-specific data.

    Returns:
        The saved event dict.
    """
    # 1. Persist event to SQLite (skip streaming tokens)
    is_streaming = payload.get("streaming") is True
    event = {"event_type": event_type, "payload": payload, "session_id": session_id}
    if not is_streaming:
        event = await database.save_event(session_id, event_type, payload)

    # 2. Track changed files
    if event_type == "file_changed" and "path" in payload:
        action = payload.get("action", "modified")
        await database.upsert_changed_file(session_id, payload["path"], action)

    # 3. Broadcast to WebSocket clients
    await manager.broadcast(session_id, event)

    return event
