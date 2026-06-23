@echo off
echo ==========================================
echo Starting OpenHands Agent Application
echo ==========================================

echo.
echo Starting FastAPI Backend...
start "OpenHands Backend" cmd /k "cd /d %~dp0backend && uvicorn main:app --port 8000"

echo Starting React Frontend...
start "OpenHands Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both services are starting up in separate windows!
echo Once the frontend server is ready, open your browser to:
echo http://localhost:5173
echo.