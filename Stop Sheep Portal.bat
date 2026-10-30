@echo off
cd /d "%~dp0"
where docker >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Docker is not installed, so the portal runs in its own window.
  echo  Close that window ^(or press Ctrl+C in it^) to stop the portal.
  echo.
  pause
  exit /b 0
)
docker compose stop
echo.
echo  Sheep Portal stopped. Your data is kept. Run "Start Sheep Portal.bat" to start it again.
pause
