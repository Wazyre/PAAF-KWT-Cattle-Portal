#!/usr/bin/env bash
# Starts the Sheep Portal (installs Docker first if it is missing). Safe to run repeatedly.
set -e
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  # No Docker: run on the PostgreSQL installed on this machine (needs Node.js 18+).
  if command -v node >/dev/null 2>&1; then
    echo "Docker was not found. Using the PostgreSQL installed on this computer instead."
    exec node scripts/run-local.mjs
  fi
  echo "Docker is not installed (and neither is Node.js, which would allow running without it)."
  read -r -p "Install it now? (needs internet and sudo) [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable --now docker
fi

# Use sudo only if the current user cannot talk to Docker directly.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
  $DOCKER info >/dev/null 2>&1 || { echo "Docker is installed but not running. Try: sudo systemctl start docker"; exit 1; }
fi

echo "Starting Sheep Portal. The first run takes a few minutes..."
$DOCKER compose up -d --build

echo "Waiting for the site to come up..."
until curl -fs -o /dev/null http://localhost:3000; do sleep 3; done

echo
echo "Sheep Portal is running at http://localhost:3000"
echo "It restarts by itself when the computer restarts. Run ./stop-sheep-portal.sh to stop it."
xdg-open http://localhost:3000 >/dev/null 2>&1 || true
