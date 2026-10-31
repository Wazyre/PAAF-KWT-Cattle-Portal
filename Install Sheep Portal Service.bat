@echo off
cd /d "%~dp0"
rem Makes Sheep Portal start at boot and restart itself if it stops answering. Asks for administrator permission.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-service.ps1"
