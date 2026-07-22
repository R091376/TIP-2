@echo off
setlocal EnableExtensions
cd /d "%~dp0..\backend"

set "VENV_PY=%CD%\.venv\Scripts\python.exe"
set "ENV_FILE=%CD%\.env"

if not exist "%VENV_PY%" (
  echo [ERROR] Missing venv: %VENV_PY%
  pause
  exit /b 1
)

REM Load KEY=VALUE from .env into this process (skip comments / blanks)
if exist "%ENV_FILE%" (
  echo Loading %ENV_FILE%
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if not "%%A"=="" if not "%%B"=="" set "%%A=%%B"
  )
) else if exist "%~dp0..\.env" (
  echo Loading %~dp0..\.env
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~dp0..\.env") do (
    if not "%%A"=="" if not "%%B"=="" set "%%A=%%B"
  )
) else (
  echo [WARN] No .env found — using process defaults
)

if "%TIP_WATCHLIST_STORE%"=="" set "TIP_WATCHLIST_STORE=postgres"

REM Local launcher always prefers local Postgres (Neon is for Render).
REM Override only if LOCAL_DATABASE_URL is already set in the environment.
if defined LOCAL_DATABASE_URL (
  set "DATABASE_URL=%LOCAL_DATABASE_URL%"
) else (
  set "DATABASE_URL=postgresql+psycopg://postgres:admin@localhost:5432/tip"
)
set "SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/tip"
set "SPRING_DATASOURCE_USERNAME=postgres"
set "SPRING_DATASOURCE_PASSWORD=admin"
set "SESSION_COOKIE_SAMESITE=lax"
set "SESSION_COOKIE_HTTPS_ONLY=false"
set "CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173"

echo.
echo TIP-2 Backend  http://127.0.0.1:8080
echo Database     : %DATABASE_URL%
echo Watchlist store: %TIP_WATCHLIST_STORE%
echo Press Ctrl+C to stop.
echo.

"%VENV_PY%" -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 1
echo.
echo Backend exited with code %ERRORLEVEL%.
pause
endlocal
