@echo off
cd /d "%~dp0"
docker compose stop
echo.
echo  Sheep Portal stopped. Your data is kept. Run "Start Sheep Portal.bat" to start it again.
pause
