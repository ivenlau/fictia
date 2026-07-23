@echo off
setlocal EnableExtensions EnableDelayedExpansion
:: Stop the Fictia dev stack started by start-dev.cmd (Windows).

cd /d "%~dp0"
set "LOG_DIR=%USERPROFILE%\fictia-logs"
set "PID_FILE=%LOG_DIR%\dev.pid"
set "SERVER_PID_FILE=%LOG_DIR%\server.pid"
set "WEB_PID_FILE=%LOG_DIR%\web.pid"
set "PORTS=3001 5173"

 echo ==^> Stopping Fictia dev stack

:: Prefer recorded process trees so unrelated Node processes are not touched.
for %%F in ("%SERVER_PID_FILE%" "%WEB_PID_FILE%" "%PID_FILE%") do (
    if exist "%%~F" (
        set /p PID=<"%%~F"
        if defined PID (
            taskkill /PID !PID! /T /F >nul 2>&1
            if not errorlevel 1 echo   stopped process tree pid !PID!
        )
        del /q "%%~F" >nul 2>&1
        set "PID="
    )
)

:: Clean up anything still listening on the app ports.
for %%P in (%PORTS%) do (
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
        if not "%%I"=="0" (
            taskkill /PID %%I /T /F >nul 2>&1
            if not errorlevel 1 echo   port %%P -^> pid %%I stopped
        )
    )
)

>nul ping 127.0.0.1 -n 2

set "BUSY="
for %%P in (%PORTS%) do (
    powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
    if errorlevel 1 set "BUSY=1"
)
if defined BUSY (
    echo [X] One or more dev ports are still listening.
    exit /b 1
)

echo ==^> All clear (3001/5173 free)
endlocal
exit /b 0
