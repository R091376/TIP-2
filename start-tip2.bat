@echo off
REM Double-click to start TIP-2 backend (8080) + frontend (5173).
setlocal EnableExtensions
cd /d "%~dp0"

set "ROOT=%CD%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "VENV_PY=%BACKEND%\.venv\Scripts\python.exe"
set "ENV_FILE=%BACKEND%\.env"

if not exist "%BACKEND%\app\main.py" (
  echo [ERROR] backend not found at "%BACKEND%"
  pause
  exit /b 1
)
if not exist "%FRONTEND%\package.json" (
  echo [ERROR] frontend not found at "%FRONTEND%"
  pause
  exit /b 1
)
if not exist "%VENV_PY%" (
  echo [ERROR] Python venv missing: "%VENV_PY%"
  echo Create it with:
  echo   cd backend
  echo   python -m venv .venv
  echo   .venv\Scripts\pip install -r requirements.txt
  pause
  exit /b 1
)

echo.
echo  ========================================
echo   TIP-2 local start
echo   Backend : http://127.0.0.1:8080
echo   Frontend: http://127.0.0.1:5173
echo  ========================================
echo.

REM Backend in its own window (loads backend\.env into the process env)
start "TIP-2 Backend" cmd /k call "%~dp0scripts\start-backend.bat"

REM Give API a moment before Vite starts
timeout /t 2 /nobreak >nul

REM Frontend in its own window (Vite proxies /api and /ws to :8080)
start "TIP-2 Frontend" cmd /k call "%~dp0scripts\start-frontend.bat"
echo Started Backend and Frontend in separate windows.
echo Close those windows to stop the servers.
echo.
timeout /t 3 /nobreak >nul
endlocal
