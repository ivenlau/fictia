@echo off
setlocal EnableExtensions EnableDelayedExpansion
:: Start the Fictia dev stack in the background (Windows).
:: Vite (5173) + Express (3001) are exposed directly; nginx is not used.

cd /d "%~dp0"
set "ROOT=%CD%"
set "LOG_DIR=%USERPROFILE%\fictia-logs"
set "LOG_FILE=%LOG_DIR%\dev.log"
set "ERR_FILE=%LOG_DIR%\dev.err.log"
set "SERVER_LOG=%LOG_DIR%\server.log"
set "SERVER_ERR=%LOG_DIR%\server.err.log"
set "WEB_LOG=%LOG_DIR%\web.log"
set "WEB_ERR=%LOG_DIR%\web.err.log"
set "STDIN_FILE=%LOG_DIR%\stdin.empty"
set "PID_FILE=%LOG_DIR%\dev.pid"
set "SERVER_PID_FILE=%LOG_DIR%\server.pid"
set "WEB_PID_FILE=%LOG_DIR%\web.pid"
set "PORTS=3001 5173"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
type nul > "%STDIN_FILE%"

where node >nul 2>&1 || (echo [X] node not found. Run install-dev.cmd first. & exit /b 1)
where pnpm >nul 2>&1 || (echo [X] pnpm not found. Run install-dev.cmd first. & exit /b 1)

:: @fictia/shared is imported from dist/ by the server.
if not exist "packages\shared\dist\index.js" (
    echo ==^> @fictia/shared not built. Running build first...
    call pnpm --filter @fictia/shared build
    if errorlevel 1 (echo [X] Build failed & exit /b 1)
)

:: Refuse to start when either dev port is already occupied.
for %%P in (%PORTS%) do (
    powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
    if errorlevel 1 (
        echo [X] Port %%P is already in use. Run stop-dev.cmd first.
        exit /b 1
    )
)

:: Start server and web separately. This avoids concurrently's Windows
:: process-tree behavior, which can leave Vite running while tsx never starts.
echo ==^> Starting server and web
echo     Server log: %SERVER_LOG%
echo     Web log:    %WEB_LOG%
:: Redirect stdin from an empty file as well as stdout/stderr. PowerShell 5.1
:: treats NUL as a relative path here instead of recognizing the Windows device.
powershell -NoProfile -Command "$s = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c','pnpm --filter @fictia/server dev' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardInput '%STDIN_FILE%' -RedirectStandardOutput '%SERVER_LOG%' -RedirectStandardError '%SERVER_ERR%' -PassThru; $w = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d','/c','pnpm --filter @fictia/web dev' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardInput '%STDIN_FILE%' -RedirectStandardOutput '%WEB_LOG%' -RedirectStandardError '%WEB_ERR%' -PassThru; Set-Content -LiteralPath '%PID_FILE%' -Value $s.Id -NoNewline; Set-Content -LiteralPath '%SERVER_PID_FILE%' -Value $s.Id -NoNewline; Set-Content -LiteralPath '%WEB_PID_FILE%' -Value $w.Id -NoNewline"
if errorlevel 1 (
    echo [X] Failed to start development processes.
    exit /b 1
)
set "PID="
set /p PID=<"%PID_FILE%"
echo ==^> server pid=%PID%

echo ==^> Waiting for 3001/5173
set "READY="
for /l %%I in (1,1,20) do (
    powershell -NoProfile -Command "$ports = @(3001,5173); if (@($ports | Where-Object { -not (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue) }).Count -eq 0) { exit 0 } else { exit 1 }"
    if not errorlevel 1 (
        set "READY=1"
        goto :ready
    )
    <nul set /p "=."
    >nul ping 127.0.0.1 -n 2
)

:ready
if not defined READY (
    echo  [X] timeout
    echo --- tail of server.err.log ---
    powershell -NoProfile -Command "if (Test-Path '%SERVER_ERR%') { Get-Content '%SERVER_ERR%' -Tail 40 }"
    echo --- tail of server.log ---
    powershell -NoProfile -Command "if (Test-Path '%SERVER_LOG%') { Get-Content '%SERVER_LOG%' -Tail 40 }"
    echo --- tail of web.err.log ---
    powershell -NoProfile -Command "if (Test-Path '%WEB_ERR%') { Get-Content '%WEB_ERR%' -Tail 40 }"
    call "%~dp0stop-dev.cmd" >nul 2>&1
    exit /b 1
)

echo  up
echo.
echo ==^> Ready
echo     Local:  http://127.0.0.1:5173
echo     API:    http://127.0.0.1:3001
echo     Server log: %SERVER_LOG%
echo     Web log:    %WEB_LOG%
echo     Stop:       %~dp0stop-dev.cmd
endlocal
exit /b 0
