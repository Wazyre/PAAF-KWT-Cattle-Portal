@echo off
cd /d "%~dp0"
rem Removes the start-at-boot service. The database and backups are kept. Asks for administrator permission.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-service.ps1"
