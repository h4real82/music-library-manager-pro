@echo off
setlocal
title MuLiMa Pro - Installer

echo ======================================================================
echo           MuLiMa Pro - Installation ^& Setup
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js ist nicht installiert!
    echo Bitte installiere die aktuelle LTS-Version von: https://nodejs.org/
    pause
    start https://nodejs.org/
    exit /b 1
)

echo [1/3] Node.js Version gefunden:
call node -v
echo.

echo [2/3] Erstelle Verzeichnisse...
if not exist "LIBRARY" mkdir "LIBRARY"
echo      Ordner LIBRARY\ bereit. Kopiere hier deine MP3/WAV/FLAC-Dateien hinein!
echo.

echo [3/3] Installiere NPM-Abhaengigkeiten...
call npm install
if %errorlevel% neq 0 (
    echo [FEHLER] Die Installation ist fehlgeschlagen.
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo [ERFOLG] MuLiMa Pro ist fertig eingerichtet!
echo.
echo Du kannst die App jetzt jederzeit per Doppelklick auf 'start.bat'
echo oder im Terminal ueber 'npm run dev' starten.
echo ======================================================================
echo.
pause
