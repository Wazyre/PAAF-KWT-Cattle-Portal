#!/usr/bin/env bash
# Stops the Sheep Portal (Docker mode). Your data is kept.
cd "$(dirname "$0")"
DOCKER=""
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then DOCKER="docker"
  elif sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"
  fi
fi
if [ -z "$DOCKER" ]; then
  echo "Docker is not running, so there is nothing to stop here."
  echo "If the portal is running in its own terminal window (without Docker), close that window or press Ctrl+C in it."
  exit 0
fi
$DOCKER compose stop
echo "Sheep Portal stopped. Run ./start-sheep-portal.sh to start it again."
