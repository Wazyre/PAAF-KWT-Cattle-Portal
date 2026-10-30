@echo off
setlocal
cd /d "%~dp0"
title Sheep Portal

rem Use Docker when it is installed AND running; otherwise fall back to local PostgreSQL.
where docker >nul 2>&1
if errorlevel 1 goto nodocker
docker info >nul 2>&1
if errorlevel 1 goto nodocker

echo Starting Sheep Portal. The first run takes a few minutes...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo  Something went wrong. Take a screenshot of this window and send it to support.
  pause
  exit /b 1
)

echo Waiting for the site to come up...
:wait
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:3000 -TimeoutSec 3).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  timeout /t 3 /nobreak >nul
  goto wait
)

start "" http://localhost:3000
echo.
echo  Sheep Portal is running at http://localhost:3000
echo  It restarts by itself when the computer restarts. Run "Stop Sheep Portal.bat" to stop it.
timeout /t 8 >nul
exit /b 0

:nodocker
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Docker is not installed or not running, and Node.js was not found either.
  echo  Do ONE of these, then run this file again:
  echo    A. Install Docker Desktop ^(https://www.docker.com/products/docker-desktop^),
  echo       open it and wait until it says "Engine running".
  echo    B. Install Node.js 18+ ^(https://nodejs.org^) and PostgreSQL
  echo       ^(https://www.postgresql.org/download/windows/^).
  echo.
  pause
  exit /b 1
)
echo Docker is not available ^(not installed, or not running^).
echo Using the PostgreSQL installed on this computer instead.
echo If you normally use Docker, close this window, start Docker Desktop, wait for
echo "Engine running", and run this file again to see your Docker data.
echo.
node scripts\run-local.mjs
set code=%errorlevel%
if not "%code%"=="0" pause
exit /b %code%
