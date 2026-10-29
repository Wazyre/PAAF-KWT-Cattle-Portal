#!/usr/bin/env bash
# Loads a farmer list into the portal. Usage: ./import-farmers.sh farmers.csv
# The CSV needs a civil ID and a name per row.
cd "$(dirname "$0")"
[ -n "$1" ] && [ -f "$1" ] || { echo "Usage: ./import-farmers.sh <farmers.csv>"; exit 1; }
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
$DOCKER compose cp "$1" app:/tmp/farmers.csv
$DOCKER compose exec app npm run import:farmers -- /tmp/farmers.csv --skip-invalid
