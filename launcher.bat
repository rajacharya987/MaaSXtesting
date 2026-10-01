@echo off
TITLE DataFinder SaaS Auto-Launcher
SETLOCAL EnableDelayedExpansion

echo ==========================================================
echo    🚀 DATAFINDER SAAS - WINDOWS 1-CLICK LAUNCHER
echo ==========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js detected: !NODE_VER!

:: 2. Check dependencies
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies...
    call npm install
)

:: 3. Launch browser in 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 4. Start Server
echo [INFO] Starting DataFinder Server on http://localhost:3000 ...
node server.js

pause
