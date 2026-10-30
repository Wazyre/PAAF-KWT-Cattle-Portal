@echo off
rem Drag a CSV file (civil ID, name) onto this file to load farmers into the portal.
cd /d "%~dp0"
if "%~1"=="" (
  echo  Drag a farmers CSV file onto this file.
  pause
  exit /b 1
)

rem Use the Docker app container when it is running; otherwise import into the local database.
set "USE_DOCKER="
where docker >nul 2>&1
if not errorlevel 1 (
  docker info >nul 2>&1
  if not errorlevel 1 (
    for /f %%i in ('docker compose ps -q app 2^>nul') do set "USE_DOCKER=1"
  )
)

if defined USE_DOCKER (
  docker compose cp "%~1" app:/tmp/farmers.csv
  docker compose exec app npm run import:farmers -- /tmp/farmers.csv --skip-invalid
) else (
  call npm run import:farmers -- "%~1" --skip-invalid
)
pause
