"""
FastAPI backend application for the OpenHands Agent UI.

Provides REST endpoints and WebSocket for real-time agent interaction.
"""

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import tkinter as tk
from tkinter import filedialog

# Load environment variables from .env
load_dotenv()

import database
import event_bus
import agent_runner
import diff_engine
import metrics_parser
from file_watcher import FileWatcher
from instructions.generate_task_file import generate_task_file

# Hardcoded workspace path
WORKSPACE_PATH = "C:/Users/Gladwin.aj/Downloads/workspace"

# File watcher instance
file_watcher: FileWatcher | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    global file_watcher

    # Initialize database
    await database.init_db()

    # Ensure workspace directory exists
    os.makedirs(WORKSPACE_PATH, exist_ok=True)

    # Start file watcher
    loop = asyncio.get_event_loop()
    file_watcher = FileWatcher(WORKSPACE_PATH)
    file_watcher.set_loop(loop)
    file_watcher.start(loop)

    yield

    # Shutdown
    if file_watcher:
        file_watcher.stop()


app = FastAPI(
    title="OpenHands Agent UI",
    description="Backend API for the OpenHands Agent frontend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------- Request/Response Models ---------------

class RunRequest(BaseModel):
    prompt: str
    workspace_path: str | None = None
    target_project: str | None = None
    init_bundle: bool = False
    default_catalog: str | None = None
    personal_schema: str | None = None
    language: str | None = None
    task_file: str | None = None


class WriteFileRequest(BaseModel):
    content: str


class UpdateSessionNameRequest(BaseModel):
    name: str


# --------------- Session Endpoints ---------------

@app.post("/api/sessions/run")
async def create_and_run_session(req: RunRequest):
    """Create a new session and start the OpenHands agent."""
    ws_path = req.workspace_path or WORKSPACE_PATH
    ws_path = os.path.abspath(ws_path)
    os.makedirs(ws_path, exist_ok=True)
    
    task_name = req.task_file.replace('.txt', '') if req.task_file else None
    session = await database.create_session(req.prompt, ws_path, name=task_name)

    # Set file watcher to emit events for this session
    if file_watcher:
        loop = asyncio.get_event_loop()
        file_watcher.update_path(ws_path, session["id"], loop)

    # Start agent in background
    await agent_runner.start_agent(
        session["id"], 
        req.prompt, 
        ws_path,
        target_project=req.target_project,
        init_bundle=req.init_bundle,
        default_catalog=req.default_catalog,
        personal_schema=req.personal_schema,
        language=req.language
    )

    return session


@app.post("/api/metadata/upload")
async def upload_metadata(file: UploadFile = File(...), workspace_path: str = Form(None)):
    """Upload a metadata file, save it to the workspace, and generate the task."""
    if not workspace_path:
        workspace_path = WORKSPACE_PATH
        
    ws_path = os.path.abspath(workspace_path)
    os.makedirs(ws_path, exist_ok=True)
    
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Save metadata to backend/instructions/metadata/
    metadata_dir = os.path.join(backend_dir, "instructions", "metadata")
    os.makedirs(metadata_dir, exist_ok=True)
    metadata_path_str = os.path.join(metadata_dir, file.filename)
    
    content = await file.read()
    with open(metadata_path_str, "wb") as f:
        f.write(content)
        
    # Generate task in backend/instructions/tasks/
    tasks_dir = os.path.join(backend_dir, "instructions", "tasks")
    os.makedirs(tasks_dir, exist_ok=True)
    
    # Map metadata_*.json -> task_*.txt
    derived_task_name = file.filename.replace("metadata_", "task_").replace(".json", ".txt")
    if derived_task_name == file.filename:
        derived_task_name = f"task_{file.filename.replace('.json', '.txt')}"
        
    task_path_str = os.path.join(tasks_dir, derived_task_name)
    
    try:
        generate_task_file(Path(metadata_path_str), Path(task_path_str), ws_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate task file: {str(e)}")
        
    with open(task_path_str, "r", encoding="utf-8") as f:
        task_content = f.read()
        
    return {"status": "success", "task_content": task_content, "task_file": derived_task_name}


@app.get("/api/sessions")
async def list_sessions():
    """List all sessions."""
    return await database.get_sessions()


@app.get("/api/metrics")
async def get_metrics(path: str = None):
    """Parse and return OpenHands metrics."""
    # Default to the backend's .agent_runs directory if none provided
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    target_path = path or os.path.join(backend_dir, ".agent_runs")
    
    try:
        data = metrics_parser.analyze_runs(target_path)
        
        # Inject task name from database
        sessions = await database.get_sessions()
        session_map = {}
        for s in sessions:
            session_map[s["id"]] = s.get("name")
            session_map[s["id"].replace("-", "")] = s.get("name")
            
        for run in data.get("detailed_runs", []):
            run["task_name"] = session_map.get(run["id"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse metrics: {str(e)}")
        
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
        
    return data


@app.delete("/api/sessions")
async def delete_all_sessions():
    """Delete all sessions and clear the database."""
    await database.delete_all_sessions()
    return {"status": "success", "message": "All sessions deleted"}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Get a single session."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Update file watcher to track this session's workspace path
    if file_watcher:
        loop = asyncio.get_event_loop()
        file_watcher.update_path(session["workspace_path"], session_id, loop)
        
    return session


@app.put("/api/sessions/{session_id}/name")
async def update_session_name(session_id: str, req: UpdateSessionNameRequest):
    """Update the user-defined name of a session."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await database.update_session_name(session_id, req.name)
    return {"status": "success", "name": req.name}


@app.get("/api/sessions/{session_id}/events")
async def get_session_events(session_id: str):
    """Get all events for a session."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await database.get_events(session_id)


@app.get("/api/sessions/{session_id}/changed-files")
async def get_changed_files(session_id: str):
    """Get changed files for a session."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await database.get_changed_files(session_id)


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    """Stop a running agent session."""
    cancelled = await agent_runner.stop_agent(session_id)
    if cancelled:
        return {"status": "stopped"}
    raise HTTPException(status_code=400, detail="No running agent for this session")


# --------------- File Endpoints ---------------

def _walk_files(base_path: str, workspace_root: str) -> list:
    """Walk workspace and return a nested file tree."""
    IGNORE_DIRS = {"node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".next", ".git"}

    result = []
    try:
        entries = sorted(os.listdir(base_path))
    except OSError:
        return result

    dirs = []
    files = []
    
    for entry in entries:
        full_path = os.path.join(base_path, entry)
        rel_path = os.path.relpath(full_path, workspace_root)

        if os.path.isdir(full_path):
            if entry in IGNORE_DIRS:
                continue
            children = _walk_files(full_path, workspace_root)
            dirs.append({
                "name": entry,
                "path": rel_path,
                "type": "directory",
                "children": children,
            })
        else:
            files.append({
                "name": entry,
                "path": rel_path,
                "type": "file",
            })

    return dirs + files


@app.get("/api/files")
async def list_files(
    session_id: str = Query(None, description="Active session ID"),
    workspace_path: str = Query(None, description="Explicit workspace path")
):
    """List all files in the workspace recursively."""
    if workspace_path:
        ws_path = os.path.abspath(workspace_path)
    elif session_id:
        session = await database.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        ws_path = session["workspace_path"]
    else:
        ws_path = WORKSPACE_PATH
        
    if not os.path.exists(ws_path):
        return []
        
    return _walk_files(ws_path, ws_path)


@app.get("/api/browse-folder")
async def browse_folder():
    """Open a native file dialog on the server machine to select a workspace folder."""
    def _open_dialog():
        root = tk.Tk()
        root.withdraw()
        # Bring to front
        root.attributes('-topmost', True)
        path = filedialog.askdirectory(title="Select Workspace Folder")
        root.destroy()
        return path
    
    # Run in a separate thread so we don't block the async event loop
    path = await asyncio.to_thread(_open_dialog)
    return {"path": path}


@app.get("/api/files/content")
async def read_file(
    path: str = Query(..., description="Relative path within workspace"),
    session_id: str = Query(None, description="Active session ID"),
    workspace_path: str = Query(None, description="Explicit workspace path")
):
    """Read the content of a file."""
    if workspace_path:
        ws_path = os.path.abspath(workspace_path)
    elif session_id:
        session = await database.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        ws_path = session["workspace_path"]
    else:
        ws_path = WORKSPACE_PATH

    full_path = os.path.normpath(os.path.join(ws_path, path))

    # Security: ensure path is within workspace
    if not full_path.startswith(os.path.normpath(ws_path)):
        raise HTTPException(status_code=403, detail="Path traversal not allowed")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return {"path": path, "content": content}
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/files/content")
async def write_file(
    path: str = Query(..., description="Relative path within workspace"),
    session_id: str = Query(..., description="Active session ID"),
    body: WriteFileRequest = ...
):
    """Write content to a file."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    ws_path = session["workspace_path"]
    full_path = os.path.normpath(os.path.join(ws_path, path))

    # Security: ensure path is within workspace
    if not full_path.startswith(os.path.normpath(ws_path)):
        raise HTTPException(status_code=403, detail="Path traversal not allowed")

    try:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(body.content)
        return {"path": path, "status": "saved"}
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------- Diff Endpoints (difflib) ---------------

@app.get("/api/diff/{session_id}")
async def get_session_diff(session_id: str):
    """Compute unified diff for all changed files in a session using difflib."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    diff = await diff_engine.compute_session_diff(session_id)
    return {"session_id": session_id, "diff": diff}


@app.get("/api/diff/{session_id}/{file_path:path}")
async def get_file_diff(session_id: str, file_path: str):
    """Compute unified diff for a single file using difflib."""
    session = await database.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    diff = await diff_engine.compute_file_diff(session_id, file_path)
    return {"session_id": session_id, "file_path": file_path, "diff": diff}


# --------------- WebSocket ---------------

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time event streaming."""
    await event_bus.manager.connect(session_id, websocket)

    try:
        # Send all existing events for this session
        existing_events = await database.get_events(session_id)
        for evt in existing_events:
            await websocket.send_json(evt)

        # Keep connection alive and listen for client messages
        while True:
            try:
                data = await websocket.receive_text()
                # Client can send commands (future: stop, etc.)
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        event_bus.manager.disconnect(session_id, websocket)
