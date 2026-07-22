@echo off
REM Stop TIP-2 processes listening on 8080 (API) and 5173 (Vite).
setlocal EnableExtensions
echo Stopping listeners on ports 8080 and 5173...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "foreach ($port in 8080,5173) { $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($c) { $c | ForEach-Object { Write-Host ('Killing PID ' + $_.OwningProcess + ' on port ' + $port); Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } else { Write-Host ('No listener on ' + $port) } }"

echo Done.
timeout /t 2 /nobreak >nul
endlocal
