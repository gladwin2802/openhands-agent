"""
SQLite persistence layer using aiosqlite.

Tables: sessions, events, changed_files, file_snapshots
"""

import json
import uuid
from datetime import datetime, timezone

import aiosqlite

DB_PATH = "app.db"


async def init_db():
    """Create tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                name TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                workspace_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Try to add the name column if it doesn't exist (for existing databases)
        try:
            await db.execute("ALTER TABLE sessions ADD COLUMN name TEXT")
        except aiosqlite.OperationalError:
            pass
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS changed_files (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                action TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id),
                UNIQUE(session_id, file_path)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS file_snapshots (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                snapshot_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id),
                UNIQUE(session_id, file_path, snapshot_type)
            )
        """)
        await db.commit()


def _now():
    return datetime.now(timezone.utc).isoformat()


# --------------- Sessions ---------------

async def create_session(prompt: str, workspace_path: str, name: str = None) -> dict:
    """Create a new session and return it as a dict."""
    session_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO sessions (id, prompt, name, status, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_id, prompt, name, "pending", workspace_path, now, now),
        )
        await db.commit()
    return {
        "id": session_id,
        "prompt": prompt,
        "name": name,
        "status": "pending",
        "workspace_path": workspace_path,
        "created_at": now,
        "updated_at": now,
    }

async def update_session_name(session_id: str, name: str):
    """Update the user-defined name of a session."""
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?",
            (name, now, session_id),
        )
        await db.commit()


async def update_session_status(session_id: str, status: str):
    """Update the status of a session."""
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
            (status, now, session_id),
        )
        await db.commit()


async def get_sessions() -> list:
    """Return all sessions ordered by creation time descending."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM sessions ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_session(session_id: str) -> dict | None:
    """Return a single session or None."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def delete_all_sessions():
    """Delete all sessions and associated data."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM file_snapshots")
        await db.execute("DELETE FROM changed_files")
        await db.execute("DELETE FROM events")
        await db.execute("DELETE FROM sessions")
        await db.commit()


# --------------- Events ---------------

async def save_event(session_id: str, event_type: str, payload: dict) -> dict:
    """Persist an event and return it as a dict."""
    event_id = str(uuid.uuid4())
    now = _now()
    payload_json = json.dumps(payload)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO events (id, session_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (event_id, session_id, event_type, payload_json, now),
        )
        await db.commit()
    return {
        "id": event_id,
        "session_id": session_id,
        "event_type": event_type,
        "payload": payload,
        "created_at": now,
    }


async def get_events(session_id: str) -> list:
    """Return all events for a session, ordered chronologically."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["payload"] = json.loads(d.pop("payload_json"))
            results.append(d)
        return results


# --------------- Changed Files ---------------

async def upsert_changed_file(session_id: str, file_path: str, action: str):
    """Insert or update a changed file record."""
    file_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO changed_files (id, session_id, file_path, action, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(session_id, file_path) DO UPDATE SET action = excluded.action, updated_at = excluded.updated_at""",
            (file_id, session_id, file_path, action, now),
        )
        await db.commit()


async def get_changed_files(session_id: str) -> list:
    """Return all changed files for a session."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM changed_files WHERE session_id = ? ORDER BY updated_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


# --------------- File Snapshots (for difflib) ---------------

async def save_file_snapshot(session_id: str, file_path: str, content: str, snapshot_type: str):
    """Save a before/after snapshot of file content for diff computation."""
    snap_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO file_snapshots (id, session_id, file_path, content, snapshot_type, created_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(session_id, file_path, snapshot_type) DO UPDATE SET content = excluded.content, created_at = excluded.created_at""",
            (snap_id, session_id, file_path, content, snapshot_type, now),
        )
        await db.commit()


async def get_file_snapshot(session_id: str, file_path: str, snapshot_type: str) -> str | None:
    """Retrieve a file snapshot content. Returns None if not found."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT content FROM file_snapshots WHERE session_id = ? AND file_path = ? AND snapshot_type = ?",
            (session_id, file_path, snapshot_type),
        )
        row = await cursor.fetchone()
        return row[0] if row else None


async def get_all_snapshots(session_id: str) -> list:
    """Return all file snapshots for a session."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM file_snapshots WHERE session_id = ? ORDER BY file_path, snapshot_type",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
