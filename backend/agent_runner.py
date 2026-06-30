"""
Agent runner using the real OpenHands Python SDK.

Integrates with the OpenHands SDK to run an AI agent against the workspace,
streaming all events to the UI via event_bus.
"""

import asyncio
import os
import traceback
import json
import time

import database
import event_bus

import logfire
import contextvars

# Context variables for safely passing session state to logfire in background threads
session_ctx = contextvars.ContextVar("session_ctx", default="")
main_loop_ctx = contextvars.ContextVar("main_loop_ctx", default=None)

# Monkey-patch logfire console exporter to hide massive JSON schema dumps and forward events to UI
try:
    from logfire._internal.exporters.console import Record
    original_from_span = Record.from_span

    @classmethod
    def custom_from_span(cls, span):
        record = original_from_span(span)
        if record.attributes is not None:
            new_attrs = {}
            for k, v in record.attributes.items():
                if k not in ('model_request_parameters', 'model_response_parameters'):
                    new_attrs[k] = v
            record.attributes = new_attrs
            
        # We no longer stream real-time events to the UI here.
        # Events are processed chronologically at the end of the turn in result.new_messages().
            
        return record

    Record.from_span = custom_from_span
except Exception:
    pass

logfire.configure(
    send_to_logfire='never',
    console=logfire.ConsoleOptions(verbose=True)
)
logfire.instrument_pydantic_ai()

# Pydantic AI SDK imports
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits
from pydantic_ai_harness import FileSystem, Shell
from pydantic_ai.messages import ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart, TextPart

# Track running agent tasks so they can be cancelled
_running_tasks: dict[str, asyncio.Task] = {}

import re

def split_task_turns(content: str) -> list[str]:
    lines = content.splitlines()
    preamble_lines = []
    turns = {}
    current_turn = None
    
    # Matches 'Turn 1:', '**Turn 1:**', etc.
    turn_header_regex = re.compile(r"^\s*\*?\*?\s*Turn\s+(\d+)\s*:", re.IGNORECASE)
    
    for line in lines:
        match = turn_header_regex.match(line)
        if match:
            current_turn = int(match.group(1))
            turns[current_turn] = [line]
        elif current_turn is None:
            preamble_lines.append(line)
        else:
            turns[current_turn].append(line)
            
    preamble = "\n".join(preamble_lines).strip()
    
    task_turns = []
    for t_num in sorted(turns.keys()):
        turn_text = "\n".join(turns[t_num]).strip()
        # Prepend preamble context to each turn so standards & path variables are preserved
        full_turn_text = f"{preamble}\n\n{turn_text}"
        task_turns.append(full_turn_text)
        
    return task_turns if task_turns else [content]

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


async def run_openhands_agent(session_id: str, prompt: str, workspace_path: str, target_project: str = None, init_bundle: bool = False, default_catalog: str = None, personal_schema: str = None, language: str = None):
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

        # 3. Initialize Pydantic AI components
        raw_llm_model = os.getenv("LLM_MODEL", "stepfun-ai/step-3.5-flash")
        # Strip litellm provider prefix if present (e.g. "openai/deepseek..." -> "deepseek...")
        if "/" in raw_llm_model and (raw_llm_model.startswith("openai/") or raw_llm_model.startswith("nvidia_nim/")):
            llm_model = raw_llm_model.split("/", 1)[1]
        else:
            llm_model = raw_llm_model

        llm_api_key = os.getenv("LLM_API_KEY")
        if not llm_api_key:
            llm_api_key = os.getenv("NVIDIA_API_KEY")
        llm_base_url = os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")

        provider = OpenAIProvider(base_url=llm_base_url, api_key=llm_api_key)
        model = OpenAIChatModel(llm_model, provider=provider)

        agent = Agent(
            model,
            instructions=(
                "You are an expert developer. "
                "Use the shell and filesystem tools to inspect, create, and modify files. "
                "CRITICAL: When using tools like `run_command`, you MUST provide the required arguments (e.g. `command`). "
                "Do not call tools with empty arguments. Always validate your work."
            ),
            capabilities=[
                Shell(cwd=str(workspace_path)),
                FileSystem(root_dir=str(workspace_path)),
            ],
            retries=5,
        )

        main_loop = asyncio.get_running_loop()
        
        # Set context variables so background threads can emit real-time events
        session_ctx.set(session_id)
        main_loop_ctx.set(main_loop)

        # Databricks Setup
        if init_bundle and target_project:
            from databricks_setup import setup_databricks_bundle
            async def emit_activity(msg: str):
                await event_bus.emit(session_id, "activity", {"content": msg})
            try:
                await setup_databricks_bundle(workspace_path, target_project, default_catalog, personal_schema, language, emit_activity)
            except Exception as e:
                error_msg = f"Databricks setup failed: {str(e)}"
                await event_bus.emit(session_id, "error", {"content": error_msg})
                await event_bus.emit(session_id, "status", {"status": "error"})
                # Abort the session
                return

        message_history = []
        instructions_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "instructions"))
        system_hint = f"\n\n[SYSTEM HINT: You are running on Windows. Your workspace path is {workspace_path}. IMPORTANT: The 'instructions' folder containing metadata and generated tasks is located at this absolute path: {instructions_path}. DO NOT look for an 'instructions' folder inside your workspace! Also, always use absolute paths for the FileEditorTool. Do not use UNIX paths. Use `;` instead of `&&` for multiple commands.]"

        # Dynamically inject the target project directory into the task content
        if target_project:
            prompt = prompt.replace("demo/", f"{target_project}/")
            
        # Split the task dynamically into logical turns
        tasks = split_task_turns(prompt)
        
        for i, turn_task in enumerate(tasks):
            # Check if cancelled
            if session_id not in _running_tasks:
                break
                
            await event_bus.emit(session_id, "activity", {"content": f"Starting Turn {i + 1} of {len(tasks)}..."})
            
            knowledge_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instructions", "knowledge.txt")
            if os.path.exists(knowledge_path):
                with open(knowledge_path, "r", encoding="utf-8") as f:
                    knowledge_text = f.read()
                turn_task = f"{turn_task}\n\n=== KNOWLEDGE ===\n{knowledge_text}"
            
            msg = turn_task + system_hint

            # Run agent sync in a thread
            start_time = time.time()
            result = await asyncio.to_thread(
                agent.run_sync,
                msg,
                message_history=message_history,
                usage_limits=UsageLimits(request_limit=150)
            )
            run_duration = time.time() - start_time
            
            # Carry forward the full conversation history to the next turn
            message_history = result.all_messages()
            
            # Parse new messages and emit events
            print(f"\n--- Detailed Agent Actions (Turn {i + 1}) ---")
            for m in result.new_messages():
                if isinstance(m, ModelResponse):
                    for part in m.parts:
                        if isinstance(part, TextPart):
                            print(f"\n🤖 [Agent Thought / Response]:\n{part.content}\n")
                            await event_bus.emit(session_id, "message", {
                                "role": "assistant",
                                "content": part.content,
                                "streaming": False,
                            })
                        elif isinstance(part, ToolCallPart):
                            # Extract arguments dictionary safely
                            if hasattr(part, 'args_as_dict'):
                                args_dict = part.args_as_dict()
                            elif isinstance(part.args, dict):
                                args_dict = part.args
                            elif hasattr(part.args, 'args_dict'):
                                args_dict = part.args.args_dict
                            elif hasattr(part.args, 'model_dump'):
                                args_dict = part.args.model_dump()
                            else:
                                try:
                                    args_dict = json.loads(getattr(part.args, 'args_json', '{}'))
                                except Exception:
                                    args_dict = {}

                            args_repr = args_dict if args_dict else str(part.args)
                            print(f"🛠️  [Tool Call]: {part.tool_name}")
                            print(f"    Arguments: {args_repr}")
                            
                            # Emit chronologically in UI
                            await event_bus.emit(session_id, "tool_execution", {
                                "content": f"⚙️ Executing tool: {part.tool_name}... ARGS: {args_repr}"
                            })
                            
                            if isinstance(args_dict, dict) and part.tool_name.lower() in ("run_command", "bash", "shell", "cmd"):
                                cmd_text = args_dict.get("command") or args_dict.get("cmd") or args_dict.get("script")
                                if not cmd_text and args_dict:
                                    # Fallback to the first value in the dictionary if the key is unknown
                                    cmd_text = list(args_dict.values())[0]
                                
                                if cmd_text:
                                    await event_bus.emit(session_id, "terminal", {
                                        "type": "command",
                                        "content": str(cmd_text),
                                    })
                                
                            if "file" in part.tool_name.lower() or "write" in part.tool_name.lower():
                                path_val = args_dict.get("path", "unknown") if isinstance(args_dict, dict) else "unknown"
                                await event_bus.emit(session_id, "file_changed", {
                                    "path": path_val,
                                    "action": "modified",
                                })
                elif isinstance(m, ModelRequest):
                    for part in m.parts:
                        if isinstance(part, ToolReturnPart):
                            output_str = str(part.content)
                            print(f"✅ [Tool Return] ({part.tool_name}):")
                            truncated_output = output_str if len(output_str) <= 500 else output_str[:500] + "... [TRUNCATED]"
                            print(f"    {truncated_output}\n")
                            
                            tool_name_lower = part.tool_name.lower()
                            if "shell" in tool_name_lower or "cmd" in tool_name_lower or "command" in tool_name_lower or "bash" in tool_name_lower:
                                await event_bus.emit(session_id, "terminal", {
                                    "type": "output",
                                    "content": output_str,
                                })
                            else:
                                await event_bus.emit(session_id, "activity", {
                                    "content": f"Tool return ({part.tool_name}):\n{truncated_output}"
                                })

            # Save Metrics for the turn
            try:
                usage = result.usage
                input_tokens = usage.input_tokens if hasattr(usage, "input_tokens") else 0
                output_tokens = usage.output_tokens if hasattr(usage, "output_tokens") else 0
                total_tokens = usage.total_tokens if hasattr(usage, "total_tokens") else (input_tokens + output_tokens)
                details = usage.details if hasattr(usage, "details") else {}
                
                await database.save_metrics(
                    session_id=session_id,
                    turn_number=i + 1,
                    model_name=llm_model,
                    prompt_tokens=input_tokens,
                    completion_tokens=output_tokens,
                    total_tokens=total_tokens,
                    details_json=json.dumps(details),
                    run_duration=run_duration
                )
            except Exception as e:
                print(f"Failed to save metrics: {e}")

        # 6. Snapshot after state
        await _snapshot_workspace(session_id, workspace_path, "after")

        # 7. Mark completed
        await database.update_session_status(session_id, "completed")
        await event_bus.emit(session_id, "status", {"status": "completed"})

    except asyncio.CancelledError:
        await database.update_session_status(session_id, "stopped")
        await event_bus.emit(session_id, "status", {"status": "stopped"})
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        await database.update_session_status(session_id, "error")
        await event_bus.emit(session_id, "error", {"content": error_msg})
        await event_bus.emit(session_id, "status", {"status": "error"})
    finally:
        _running_tasks.pop(session_id, None)


async def start_agent(session_id: str, prompt: str, workspace_path: str, target_project: str = None, init_bundle: bool = False, default_catalog: str = None, personal_schema: str = None, language: str = None):
    """Start the agent as a background asyncio task."""
    task = asyncio.create_task(run_openhands_agent(session_id, prompt, workspace_path, target_project, init_bundle, default_catalog, personal_schema, language))
    _running_tasks[session_id] = task
    return task


async def stop_agent(session_id: str) -> bool:
    """Cancel a running agent task. Returns True if cancelled."""
    cancelled = False
    
    task = _running_tasks.get(session_id)
    if task and not task.done():
        task.cancel()
        cancelled = True
        
    return cancelled
