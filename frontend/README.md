# OpenHands Agent Frontend

The frontend of the OpenHands Agent IDE is a rich, single-page application built with **React** and **Vite**. It provides a VS Code-like experience tailored specifically for interacting with and reviewing the work of an AI coding agent.

## User Interface Overview

The UI is divided into several resizable, context-aware panels:

- **Activity Bar & Sidebars**: 
  - **Explorer**: A file tree to navigate the target workspace.
  - **Sessions**: A list of current and historical agent task sessions.
  - **Dashboard**: A metrics visualization panel for analyzing agent performance over time.
- **Editor Area**: Powered by `@monaco-editor/react`, this pane allows you to view and directly edit the code files residing in the workspace.
- **Bottom Panel**:
  - **Terminal**: A live view of the command-line inputs and outputs executed by the agent during a session.
  - **Diff**: A code comparison view highlighting the exact line-by-line modifications made by the AI.
- **Activity Panel (Right Pane)**: The core communication hub. It renders the live conversation with the agent, streaming its "thoughts", tracking its task progress, and showing which files it is actively modifying.

## Tech Stack
- **Framework**: React 19
- **Build Tool**: Vite
- **Code Editor**: `@monaco-editor/react` (brings VS Code's editor to the web)
- **Markdown & UI**: `react-markdown` (with `remark-gfm`) for rendering agent responses, and `react-icons`.

## Setup & Execution

### Prerequisites
- Node.js and npm installed.

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the JavaScript dependencies:
   ```bash
   npm install
   ```

### Available Scripts

- `npm run dev`: Starts the Vite development server on [http://localhost:5173](http://localhost:5173) with hot-module replacement.
- `npm run build`: Compiles and bundles the application for production deployment.
- `npm run lint`: Runs ESLint to enforce code quality.
