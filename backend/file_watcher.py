"""
File system watcher using watchdog.

Monitors the workspace directory for create/modify/delete events
and emits 'file_changed' events via the event bus.
"""

import asyncio
import os
import threading

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

import event_bus

# Directories to ignore when watching
IGNORE_DIRS = {"node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".next", ".git"}


class WorkspaceHandler(FileSystemEventHandler):
    """Handles file system events and emits them to the event bus."""

    def __init__(self, workspace_path: str, session_id: str | None = None):
        super().__init__()
        self.workspace_path = workspace_path
        self.session_id = session_id
        self._loop = None

    def set_loop(self, loop):
        self._loop = loop

    def set_session_id(self, session_id: str):
        self.session_id = session_id

    def _should_ignore(self, path: str) -> bool:
        """Check if the path is in an ignored directory."""
        parts = path.replace("\\", "/").split("/")
        return any(part in IGNORE_DIRS for part in parts)

    def _emit(self, file_path: str, action: str):
        """Emit a file_changed event (called from watchdog thread)."""
        if self._should_ignore(file_path):
            return
        if not self.session_id or not self._loop:
            return

        rel_path = os.path.relpath(file_path, self.workspace_path)
        asyncio.run_coroutine_threadsafe(
            event_bus.emit(self.session_id, "file_changed", {
                "path": rel_path,
                "action": action,
            }),
            self._loop,
        )

    def on_created(self, event):
        if not event.is_directory:
            self._emit(event.src_path, "created")

    def on_modified(self, event):
        if not event.is_directory:
            self._emit(event.src_path, "modified")

    def on_deleted(self, event):
        if not event.is_directory:
            self._emit(event.src_path, "deleted")

    def on_moved(self, event):
        if not event.is_directory:
            self._emit(event.src_path, "deleted")
            self._emit(event.dest_path, "created")


class FileWatcher:
    """Manages the watchdog observer for a workspace directory."""

    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        self.handler = WorkspaceHandler(workspace_path)
        self.observer = Observer()
        self._started = False

    def start(self, loop=None):
        """Start watching the workspace directory."""
        if self._started:
            return
        if loop:
            self.handler.set_loop(loop)
        self.observer.schedule(self.handler, self.workspace_path, recursive=True)
        self.observer.start()
        self._started = True

    def stop(self):
        """Stop the file watcher."""
        if self._started:
            self.observer.stop()
            self.observer.join()
            self._started = False

    def set_session_id(self, session_id: str):
        """Update the current session ID for event emission."""
        self.handler.set_session_id(session_id)

    def set_loop(self, loop):
        """Set the asyncio event loop for the handler."""
        self.handler.set_loop(loop)

    def update_path(self, workspace_path: str, session_id: str, loop=None):
        """Update the watched path and session ID dynamically."""
        if self.workspace_path == workspace_path and self.handler.session_id == session_id:
            return  # No change

        self.stop()
        self.workspace_path = workspace_path
        self.handler = WorkspaceHandler(workspace_path)
        self.handler.set_session_id(session_id)
        if loop:
            self.handler.set_loop(loop)
        self.observer = Observer()
        self._started = False
        self.start(loop)

