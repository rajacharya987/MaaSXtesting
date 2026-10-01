#!/usr/bin/env bash
# ==============================================================================
# DataFinder SaaS Auto-Launcher
# Starts backend server, verifies database, and launches local browser
# ==============================================================================

set -e

# Change directory to the script's directory
cd "$(dirname "$0")"

echo ""
echo "=========================================================="
echo "   🚀 DATAFINDER SAAS - AUTO LAUNCHER"
echo "=========================================================="
echo ""

# 1. Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Error: Node.js is not found in PATH."
    echo "Please install Node.js (v18 or higher) from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js detected: $NODE_VERSION"

# 2. Check if node_modules exists, install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo "📦 Installing required dependencies via npm..."
    npm install
fi

# Set host port
PORT=${PORT:-3000}
HOST_URL="http://localhost:$PORT"

echo "⚙️  Starting DataFinder server on $HOST_URL..."

# Helper to open browser cross-platform
open_browser() {
    sleep 1.5
    echo "🌐 Opening browser at $HOST_URL..."
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$HOST_URL" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$HOST_URL" >/dev/null 2>&1 &
    elif command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -Command "Start-Process '$HOST_URL'" >/dev/null 2>&1 &
    elif command -v cmd.exe >/dev/null 2>&1; then
        cmd.exe /c start "$HOST_URL" >/dev/null 2>&1 &
    else
        echo "Please open $HOST_URL in your browser."
    fi
}

# Launch browser in background
open_browser &

# Start the Node.js server
exec node server.js
