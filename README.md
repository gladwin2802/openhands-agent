# OpenHands Agent IDE

OpenHands Agent IDE is a comprehensive, locally-hosted Integrated Development Environment (IDE) designed specifically for interacting with and managing the [OpenHands](https://github.com/All-Hands-AI/OpenHands) AI agent. 

Unlike a standard command-line interface, this project provides a rich, VS Code-like graphical interface and a robust backend to execute, monitor, and manage AI-driven coding tasks in real-time.

## Features & Capabilities

- **Real-Time Agent Interaction**: Communicate with the OpenHands agent via a chat interface and watch it stream its thoughts, tool calls, and terminal outputs in real time via WebSockets.
- **Visual File Workspace**: Browse, view, and edit workspace files directly from the UI using the integrated Monaco Code Editor.
- **Native Diff Engine**: See exactly what the AI agent changed in your codebase. The backend takes "before" and "after" snapshots of your workspace and computes unified diffs natively—without relying on Git.
- **Session Management**: Automatically persist agent sessions, chat histories, and file changes in a local SQLite database, allowing you to review past agent runs.
- **Live Terminal Output**: Monitor the agent's terminal commands and standard output/error directly in the UI.

## Architecture

The project is split into two primary layers:

1. **Backend (FastAPI)**: A Python-based server that wraps the `openhands.sdk`. It orchestrates agent runs, captures SDK events, manages local file watching, calculates code diffs, and streams data over WebSockets.
2. **Frontend (React/Vite)**: A rich, responsive web application offering a split-pane layout with file trees, code editors, terminal views, and real-time chat.

For deeper technical details, refer to the component READMEs:
- [Backend Documentation](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)

## Quick Start (Windows)

The repository includes a batch script to start both components simultaneously.

1. Clone the repository and navigate to the root directory.
2. Run the start script:
   ```bash
   start_app.bat
   ```

This will launch the FastAPI backend on port `8000` and the Vite development server on port `5173`. Open [http://localhost:5173](http://localhost:5173) in your browser to start using the IDE. You will be prompted to select a local workspace directory before starting an agent session.
