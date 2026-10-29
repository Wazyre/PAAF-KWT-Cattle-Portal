@echo off
setlocal
cd /d "%~dp0"
title Sheep Portal

docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Docker Desktop is not running.
  echo  1. If it is not installed: https://www.docker.com/products/docker-desktop
  echo  2. Open Docker Desktop, wait until it says "Engine running", then run this file again.
  echo.
  pause
  exit /b 1
)

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
