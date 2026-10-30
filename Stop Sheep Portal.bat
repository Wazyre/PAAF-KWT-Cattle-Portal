@echo off
cd /d "%~dp0"
where docker >nul 2>&1
if errorlevel 1 goto nodocker
docker info >nul 2>&1
if errorlevel 1 goto nodocker
docker compose stop
echo.
echo  Sheep Portal stopped. Your data is kept. Run "Start Sheep Portal.bat" to start it again.
pause
exit /b 0

:nodocker
echo.
echo  Docker is not running, so there is nothing to stop here.
echo  If the portal is running in its own window ^(without Docker^), close that window
echo  or press Ctrl+C in it to stop the portal.
echo.
pause
exit /b 0
