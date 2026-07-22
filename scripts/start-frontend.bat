@echo off
setlocal EnableExtensions
cd /d "%~dp0..\frontend"

if not exist "package.json" (
  echo [ERROR] frontend package.json not found
  pause
  exit /b 1
)

REM Local dev: leave VITE_API_BASE_URL empty so Vite proxies /api and /ws to :8080
set "VITE_API_BASE_URL="

if not exist "node_modules\" (
  echo node_modules missing — running npm ci ...
  call npm ci
  if errorlevel 1 (
    echo [ERROR] npm ci failed
    pause
    exit /b 1
  )
)

echo.
echo TIP-2 Frontend  http://127.0.0.1:5173
echo API via Vite proxy -^> http://127.0.0.1:8080
echo Press Ctrl+C to stop.
echo.

call npm run dev -- --host 127.0.0.1 --port 5173
echo.
echo Frontend exited with code %ERRORLEVEL%.
pause
endlocal
