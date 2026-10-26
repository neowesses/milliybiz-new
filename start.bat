@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist node_modules\@anthropic-ai\sdk call npm install --no-fund --no-audit
start "" http://localhost:8080/admin/#/robot
rem MB_WATCH=1: server restarts itself when the code changes (exit code 75)
set MB_WATCH=1
:run
node server.js
if %errorlevel%==75 goto run
pause
exit /b

:nonode
echo Node.js not found - starting the simple server without the robot. Install Node.js from https://nodejs.org
start "" http://localhost:8080/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
pause
