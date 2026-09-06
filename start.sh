#!/usr/bin/env bash

echo "======================================================================"
echo "          MuLiMa Pro - Music Library Manager Pro & DJ Studio"
echo "======================================================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[FEHLER] Node.js wurde nicht gefunden!"
    echo "Bitte installiere Node.js von https://nodejs.org/"
    exit 1
fi

# Create LIBRARY folder if it doesn't exist
mkdir -p "LIBRARY"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installiere Abhängigkeiten..."
    npm install
fi

echo "[INFO] Starte MuLiMa Pro Server..."
echo "[INFO] Öffne Browser unter: http://localhost:3000"

# Open browser depending on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    (sleep 2 && open "http://localhost:3000") &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    (sleep 2 && xdg-open "http://localhost:3000") &
fi

npm run dev
