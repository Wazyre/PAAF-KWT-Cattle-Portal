#!/usr/bin/env bash
# Loads a farmer list into the portal. Usage: ./import-farmers.sh farmers.csv
# The CSV needs a civil ID and a name per row.
cd "$(dirname "$0")"
[ -n "$1" ] && [ -f "$1" ] || { echo "Usage: ./import-farmers.sh <farmers.csv>"; exit 1; }

# Use the Docker app container if it is running; otherwise import into the local database.
DOCKER=""
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then DOCKER="docker"
  elif sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"
  fi
fi
if [ -n "$DOCKER" ] && [ -n "$($DOCKER compose ps -q app 2>/dev/null)" ]; then
  $DOCKER compose cp "$1" app:/tmp/farmers.csv
  $DOCKER compose exec app npm run import:farmers -- /tmp/farmers.csv --skip-invalid
else
  exec npm run import:farmers -- "$1" --skip-invalid
fi
