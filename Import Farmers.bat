@echo off
rem Drag a CSV file (civil ID, name) onto this file to load farmers into the portal.
cd /d "%~dp0"
if "%~1"=="" (
  echo  Drag a farmers CSV file onto this file.
  pause
  exit /b 1
)
where docker >nul 2>&1
if errorlevel 1 (
  call npm run import:farmers -- "%~1" --skip-invalid
) else (
  docker compose cp "%~1" app:/tmp/farmers.csv
  docker compose exec app npm run import:farmers -- /tmp/farmers.csv --skip-invalid
)
pause
