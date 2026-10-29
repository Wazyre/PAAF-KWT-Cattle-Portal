#!/usr/bin/env bash
# Stops the Sheep Portal. Your data is kept.
cd "$(dirname "$0")"
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
$DOCKER compose stop
echo "Sheep Portal stopped. Run ./start-sheep-portal.sh to start it again."
