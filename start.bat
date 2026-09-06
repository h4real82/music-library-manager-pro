@echo off
setlocal
title MuLiMa Pro - Music Library Manager Pro

echo ======================================================================
echo           MuLiMa Pro - Music Library Manager Pro ^& DJ Studio
echo ======================================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js wurde nicht auf deinem System gefunden!
    echo Bitte lade Node.js von https://nodejs.org/ herunter und installiere es.
    echo.
    pause
    start https://nodejs.org/
    exit /b 1
)

:: Create LIBRARY folder if it doesn't exist
if not exist "LIBRARY" (
    echo [INFO] Erstelle Musik-Ordner: LIBRARY\
    mkdir "LIBRARY"
)

:: Check if node_modules exists, install if missing
if not exist "node_modules\" (
    echo [INFO] Erste Ausfuehrung erkannt: Installiere Abhaengigkeiten...
    echo Dies kann 1-2 Minuten dauern...
    call npm install
    if %errorlevel% neq 0 (
        echo [FEHLER] Fehler bei der Installation der Abhaengigkeiten.
        pause
        exit /b 1
    )
    echo [ERFOLG] Installation abgeschlossen!
    echo.
)

:: Open browser after 2 seconds in background
echo [INFO] Starte MuLiMa Pro Server...
echo [INFO] Oeffne Web-Oberflaeche unter: http://localhost:3000
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start Vite dev server
call npm run dev

pause
