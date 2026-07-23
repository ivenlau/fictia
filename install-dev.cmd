@echo off
setlocal enabledelayedexpansion
:: One-shot provisioning for the Fictia dev environment (Windows).
:: Idempotent -- safe to re-run.
::
:: What it does:
::   1. Verifies Node + pnpm toolchain
::   2. Runs pnpm install (workspace)
::   3. Creates .env from .env.example (only if missing)
::   4. Builds @fictia/shared (needed because server imports its dist/)
::
:: Configuration (all optional, env vars):
::   FICTIA_AUTH_USER   (default: admin)
::   FICTIA_AUTH_PASS   (default: yourpassword)
::   FICTIA_PUBLIC_IP   (auto-detected; override if detection fails)
::   FICTIA_PUBLIC_PORT (default: 8080)
::
:: After this script finishes, run start-dev.cmd to launch the app.

cd /d "%~dp0"

if "%FICTIA_AUTH_USER%"=="" set "FICTIA_AUTH_USER=admin"
if "%FICTIA_AUTH_PASS%"=="" set "FICTIA_AUTH_PASS=yourpassword"
if "%FICTIA_PUBLIC_PORT%"=="" set "FICTIA_PUBLIC_PORT=8080"

:: ---- 1. Toolchain ----------------------------------------------------------
echo ==^> Checking toolchain

where node >nul 2>&1 || (echo [X] node not found. Install Node 18+ first. & exit /b 1)
where pnpm >nul 2>&1 || (echo [X] pnpm not found. Install pnpm first: npm i -g pnpm & exit /b 1)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (echo [X] Node %NODE_MAJOR% detected, need ^>= 18. & exit /b 1)

for /f %%v in ('node -v') do set NODE_VER=%%v
for /f %%v in ('pnpm -v') do set PNPM_VER=%%v
echo   node %NODE_VER%, pnpm %PNPM_VER%

:: ---- 2. pnpm install -------------------------------------------------------
if exist "node_modules" if exist "apps\server\node_modules" if exist "apps\web\node_modules" (
    echo ==^> node_modules already present, skipping pnpm install
) else (
    echo ==^> Running pnpm install
    call pnpm install
    if errorlevel 1 (echo [X] pnpm install failed & exit /b 1)
)

:: ---- 3. .env ----------------------------------------------------------------
if exist ".env" (
    echo ==^> .env already exists, leaving it alone
) else (
    if not exist ".env.example" (
        echo [X] .env.example missing -- cannot seed .env
        exit /b 1
    )
    echo ==^> Creating .env from .env.example
    copy /y .env.example .env >nul
    findstr /b "HOST=" .env >nul 2>&1 || echo.>> .env && echo HOST=127.0.0.1>> .env
    echo [!] .env has empty LLM API keys -- fill them in via the Settings UI in the app.
)

:: ---- 4. Build shared --------------------------------------------------------
if exist "packages\shared\dist\index.js" (
    echo ==^> @fictia/shared already built
) else (
    echo ==^> Building @fictia/shared
    call pnpm --filter @fictia/shared build
    if errorlevel 1 (echo [X] Build failed & exit /b 1)
)

:: ---- 5. Done ---------------------------------------------------------------
echo.
echo ==^> Dev environment ready
echo.
echo   Next step: start-dev.cmd
echo.
endlocal
