@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Installiere die aktuelle Node.js LTS-Version von https://nodejs.org/
  pause
  exit /b 1
)
node --version
if not exist package.json (
  echo package.json fehlt. Bitte das Repository als Projektordner oeffnen.
  pause
  exit /b 1
)
echo.
echo Starte Lumeceta Sentinel...
echo Browser: http://127.0.0.1:8787
start "Lumeceta Sentinel" cmd /k "node server/server.js"
timeout /t 2 >nul
start "" http://127.0.0.1:8787
