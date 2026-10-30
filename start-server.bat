@echo off
rem BeamDash server. Extra options can be passed through, for example:
rem   start-server.bat --port 8080
rem   start-server.bat --game-host 192.168.1.50     (server in a VM / other PC than BeamNG)
rem   start-server.bat --demo off                   (never show the demo car)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node server\server.js %*
pause
