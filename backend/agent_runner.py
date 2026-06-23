"""
Agent runner using the real OpenHands Python SDK.

Integrates with the OpenHands SDK to run an AI agent against the workspace,
streaming all events to the UI via event_bus.
"""

import asyncio
import os
import traceback

import database
import event_bus

# OpenHands SDK imports
from openhands.sdk import LLM, Agent, Conversation, Tool
from openhands.tools.file_editor import FileEditorTool
from openhands.tools.task_tracker import TaskTrackerTool
from openhands.tools.terminal import TerminalTool
from openhands.sdk.event import ActionEvent, ObservationEvent, MessageEvent

# Track running agent tasks so they can be cancelled
_running_tasks: dict[str, asyncio.Task] = {}
_running_conversations = {}
_stream_buffers: dict[str, str] = {}

def _walk_workspace(workspace_path: str) -> dict[str, str]:
    """
    Walk the workspace directory and return a dict of {relative_path: content}
    for all text files. Used for before/after snapshots for difflib.
    """
    IGNORE_DIRS = {"node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".next", ".git"}
    IGNORE_EXTENSIONS = {".pyc", ".pyo", ".so", ".o", ".a", ".dll", ".exe", ".bin", ".jpg", ".jpeg", ".png", ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot"}
    
    files = {}
    for root, dirs, filenames in os.walk(workspace_path):
        # Filter out ignored directories in-place
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in IGNORE_EXTENSIONS:
                continue
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, workspace_path)
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    files[rel_path] = f.read()
            except (OSError, PermissionError):
                pass
    return files


async def _snapshot_workspace(session_id: str, workspace_path: str, snapshot_type: str):
    """Snapshot all workspace files as 'before' or 'after' for difflib."""
    files = await asyncio.to_thread(_walk_workspace, workspace_path)
    for rel_path, content in files.items():
        await database.save_file_snapshot(session_id, rel_path, content, snapshot_type)


async def run_openhands_agent(session_id: str, prompt: str, workspace_path: str):
    """
    Run the OpenHands agent for a session.

    1. Snapshot workspace files as 'before'
    2. Set status to 'running'
    3. Initialize and run the OpenHands SDK agent
    4. Stream events via event_bus
    5. Snapshot workspace files as 'after'
    6. Set status to 'completed' or 'error'
    """
    try:
        # 1. Snapshot before state
        await _snapshot_workspace(session_id, workspace_path, "before")

        # 2. Mark session as running
        await database.update_session_status(session_id, "running")
        await event_bus.emit(session_id, "status", {"status": "running"})

        # 3. Initialize OpenHands SDK components
        llm_model = os.getenv("LLM_MODEL")
        llm_api_key = os.getenv("LLM_API_KEY")
        llm_base_url = os.getenv("LLM_BASE_URL")

        llm = LLM(
            model=llm_model,
            api_key=llm_api_key,
            base_url=llm_base_url,
            stream=True,
            litellm_extra_body={"parallel_tool_calls": False},
        )

        agent = Agent(
            llm=llm,
            tools=[
                Tool(name=TerminalTool.name),
                Tool(name=FileEditorTool.name),
                Tool(name=TaskTrackerTool.name),
            ],
        )

        orig_step = agent.step
        def patched_step(*args, **kwargs):
            action = orig_step(*args, **kwargs)
            if action and action.__class__.__name__ == "TerminalAction":
                if hasattr(action, "command") and isinstance(action.command, str):
                    # PowerShell doesn't support && in this environment, replace with ;
                    action.command = action.command.replace(" && ", " ; ").replace("&&", ";")
            return action
        object.__setattr__(agent, 'step', patched_step)

        main_loop = asyncio.get_running_loop()

        # 4. Create event callback to map OpenHands events → UI events
        def on_event(event):
            """Synchronous callback — schedule async emit on the event loop."""
            loop = main_loop

            if isinstance(event, MessageEvent):
                if session_id in _stream_buffers:
                    _stream_buffers.pop(session_id)

                source = getattr(event, "source", "agent")
                if source == "user":
                    return
                # Try to extract content string cleanly from Message object
                content = ""
                if hasattr(event, "llm_message") and event.llm_message:
                    text_parts = []
                    for c in getattr(event.llm_message, "content", []):
                        if hasattr(c, "text"):
                            text_parts.append(c.text)
                    content = "".join(text_parts)
                if not content:
                    content = str(event)
                
                # Map agent source to 'assistant' to match the streaming token logic
                # in the frontend which looks for role='assistant'
                emit_role = "assistant" if source == "agent" else source
                
                asyncio.run_coroutine_threadsafe(
                    event_bus.emit(session_id, "message", {
                        "role": emit_role,
                        "content": content,
                        "streaming": False,
                    }),
                    loop,
                )

            elif isinstance(event, ActionEvent):
                action = event.action
                
                # Emit the flushed stream buffer as a non-streaming message to seal the token stream and persist it
                if session_id in _stream_buffers and _stream_buffers[session_id]:
                    buffered_content = _stream_buffers.pop(session_id)
                    asyncio.run_coroutine_threadsafe(
                        event_bus.emit(session_id, "message", {
                            "role": "assistant",
                            "content": buffered_content,
                            "streaming": False,
                        }),
                        loop,
                    )

                tool_name = getattr(event, "tool_name", "")
                
                # Terminal command execution
                if tool_name == "terminal" or (action and action.__class__.__name__ == "TerminalAction"):
                    command = getattr(action, "command", "")
                    asyncio.run_coroutine_threadsafe(
                        event_bus.emit(session_id, "terminal", {
                            "type": "command",
                            "content": command,
                        }),
                        loop,
                    )
                # File editing operations
                elif tool_name == "file_editor" or (action and action.__class__.__name__ == "FileEditorAction"):
                    file_path = getattr(action, "path", "unknown")
                    cmd_type = getattr(action, "command", "modified")
                    action_type = "created" if cmd_type == "create" else "modified"
                    asyncio.run_coroutine_threadsafe(
                        event_bus.emit(session_id, "file_changed", {
                            "path": file_path,
                            "action": action_type,
                        }),
                        loop,
                    )
                
                # Check summary or metadata to emit an activity event
                summary = getattr(event, "summary", "")
                if summary:
                    # Filter out raw JSON tool calls from cluttering the activity panel
                    if not summary.startswith("task_tracker: {") and not summary.startswith("file_editor: {"):
                        asyncio.run_coroutine_threadsafe(
                            event_bus.emit(session_id, "activity", {
                                "content": summary,
                            }),
                            loop,
                        )

            elif isinstance(event, ObservationEvent):
                obs = getattr(event, "observation", None)
                tool_name = getattr(event, "tool_name", "")
                
                if obs:
                    if tool_name == "terminal" or obs.__class__.__name__ == "TerminalObservation":
                        # Extract CLI output
                        output = getattr(obs, "text", "")
                        if not output and hasattr(obs, "content"):
                            text_parts = []
                            for c in getattr(obs, "content", []):
                                if hasattr(c, "text"):
                                    text_parts.append(c.text)
                            output = "".join(text_parts)
                        if not output:
                            output = str(obs)
                            
                        asyncio.run_coroutine_threadsafe(
                            event_bus.emit(session_id, "terminal", {
                                "type": "output",
                                "content": output,
                            }),
                            loop,
                        )
                    elif tool_name == "file_editor" or obs.__class__.__name__ == "FileEditorObservation":
                        file_path = getattr(obs, "path", "unknown")
                        cmd_type = getattr(obs, "command", "modified")
                        action_type = "created" if cmd_type == "create" else "modified"
                        asyncio.run_coroutine_threadsafe(
                            event_bus.emit(session_id, "file_changed", {
                                "path": file_path,
                                "action": action_type,
                            }),
                            loop,
                        )
                    elif tool_name == "task_tracker" or obs.__class__.__name__ == "TaskTrackerObservation":
                        output = getattr(obs, "text", "")
                        if not output and hasattr(obs, "content"):
                            text_parts = []
                            for c in getattr(obs, "content", []):
                                if hasattr(c, "text"):
                                    text_parts.append(c.text)
                            output = "".join(text_parts)
                        if not output:
                            output = str(obs)
                        asyncio.run_coroutine_threadsafe(
                            event_bus.emit(session_id, "task_update", {
                                "content": output,
                            }),
                            loop,
                        )

        # Token streaming callback
        def on_token(chunk):
            """Stream LLM tokens to the UI."""
            loop = main_loop
            for choice in chunk.choices:
                delta = choice.delta
                if delta and hasattr(delta, "content") and delta.content:
                    # Buffer content for persistence
                    _stream_buffers[session_id] = _stream_buffers.get(session_id, "") + delta.content

                    asyncio.run_coroutine_threadsafe(
                        event_bus.emit(session_id, "message", {
                            "role": "assistant",
                            "content": delta.content,
                            "streaming": True,
                        }),
                        loop,
                    )

        # 5. Create conversation and run
        conversation = Conversation(
            agent=agent,
            workspace=workspace_path,
            callbacks=[on_event],
            token_callbacks=[on_token],
        )
        _running_conversations[session_id] = conversation

        system_hint = f"\n\n[SYSTEM HINT: You are running on a Windows environment. Your absolute workspace path is {workspace_path}. When using the FileEditorTool, you MUST provide an absolute path on the C: drive. Do not use UNIX paths. Strictly in terminal use `;` instead of `&&` for multiple commands. CRITICAL: If the terminal returns 'Process still running (soft timeout)' after an error, DO NOT attempt to send C-c (Ctrl+C) or C-z. The terminal is NOT stuck, it is just waiting for the next command. Sending C-c will waste your time. Simply proceed to execute your next corrected command!]"
        conversation.send_message(prompt + system_hint)

        # Run in a thread since conversation.run() is blocking
        await asyncio.to_thread(conversation.run)

        # 6. Snapshot after state
        await _snapshot_workspace(session_id, workspace_path, "after")

        # 7. Mark completed
        await database.update_session_status(session_id, "completed")
        await event_bus.emit(session_id, "status", {"status": "completed"})

    except asyncio.CancelledError:
        conv = _running_conversations.get(session_id)
        if conv:
            try:
                conv.close()
            except Exception:
                pass
        await database.update_session_status(session_id, "stopped")
        await event_bus.emit(session_id, "status", {"status": "stopped"})
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        await database.update_session_status(session_id, "error")
        await event_bus.emit(session_id, "error", {"content": error_msg})
        await event_bus.emit(session_id, "status", {"status": "error"})
    finally:
        _running_tasks.pop(session_id, None)
        _running_conversations.pop(session_id, None)
        _stream_buffers.pop(session_id, None)


async def start_agent(session_id: str, prompt: str, workspace_path: str):
    """Start the agent as a background asyncio task."""
    task = asyncio.create_task(run_openhands_agent(session_id, prompt, workspace_path))
    _running_tasks[session_id] = task
    return task


async def stop_agent(session_id: str) -> bool:
    """Cancel a running agent task. Returns True if cancelled."""
    cancelled = False
    
    task = _running_tasks.get(session_id)
    if task and not task.done():
        task.cancel()
        cancelled = True
        
    conv = _running_conversations.get(session_id)
    if conv:
        try:
            conv.close()
        except Exception:
            pass
        cancelled = True
        
    return cancelled
