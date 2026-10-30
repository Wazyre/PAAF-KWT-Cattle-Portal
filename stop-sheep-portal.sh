#!/usr/bin/env bash
# Stops the Sheep Portal. Your data is kept.
cd "$(dirname "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed, so the portal runs in its own terminal window."
  echo "Close that window (or press Ctrl+C in it) to stop the portal."
  exit 0
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
$DOCKER compose stop
echo "Sheep Portal stopped. Run ./start-sheep-portal.sh to start it again."
