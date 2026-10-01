# PowerShell Auto-Launcher for DataFinder SaaS
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚀 DATAFINDER SAAS - POWERSHELL AUTO-LAUNCHER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not found. Please install from https://nodejs.org" -ForegroundColor Red
    Exit 1
}

$nodeVer = node -v
Write-Host "[OK] Node.js Version: $nodeVer" -ForegroundColor Green

# Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing npm packages..." -ForegroundColor Yellow
    npm install
}

# Open browser after short delay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"
} | Out-Null

Write-Host "[INFO] Starting server at http://localhost:3000..." -ForegroundColor Cyan
node server.js
