# OpenHands Agent Backend

The backend of the OpenHands Agent IDE is a robust Python server built with **FastAPI**. It acts as the bridge between the rich web frontend and the underlying AI agent (powered by the `openhands.sdk`). 

## Core Responsibilities

1. **Agent Orchestration (`agent_runner.py`)**: 
   - Initializes and configures the OpenHands `Agent`, `LLM`, and `Conversation` instances.
   - Intercepts granular SDK events (`MessageEvent`, `ActionEvent`, `ObservationEvent`) and streams them to the UI as standard JSON payloads.
2. **Real-time Event Bus (`event_bus.py`)**: 
   - Manages WebSocket connections to the frontend, pushing live token streams, terminal commands, and file change notifications instantly.
3. **Native Diffing (`diff_engine.py`)**: 
   - Takes full file snapshots of the workspace before and after an agent session.
   - Computes Python `difflib`-based unified diffs so users can review the agent's exact code modifications without needing a Git repository.
4. **Persistence (`database.py`)**: 
   - Uses `aiosqlite` to store session metadata, chat histories, execution events, and file snapshots.
5. **Workspace Monitoring (`file_watcher.py`)**:
   - Uses `watchdog` to monitor the target workspace directory for external changes while the agent is running.
6. **Task Generation & Metrics**:
   - Includes utilities to parse JSON metadata into executable agent tasks and analyze agent run metrics.

## Tech Stack
- **Framework**: FastAPI (served via Uvicorn)
- **Agent SDK**: `openhands-sdk`, `openhands-tools`
- **Database**: SQLite (via `aiosqlite`)
- **Utilities**: `watchdog` (file system monitoring), `python-multipart`

## Setup & Execution

### Prerequisites
- Python 3.8 or higher.
- An environment configured with your LLM API keys (e.g., `LLM_API_KEY`, `LLM_MODEL` in a `.env` file).

### Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

### Running Locally

Start the Uvicorn development server:
```bash
uvicorn main:app --port 8000
```
*(Alternatively, you can use the `start_app.bat` script in the root directory to run both frontend and backend concurrently.)*
