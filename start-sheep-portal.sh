#!/usr/bin/env bash
# Starts the Sheep Portal with Docker, or with the local PostgreSQL if Docker is not available.
# Safe to run repeatedly.
set -e
cd "$(dirname "$0")"

# Pick a working Docker command (plain, then sudo). Empty if Docker is missing or not running.
DOCKER=""
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then DOCKER="docker"
  elif sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"
  fi
fi

if [ -z "$DOCKER" ]; then
  # No usable Docker: run on the PostgreSQL installed on this machine (needs Node.js 20.19+).
  if command -v node >/dev/null 2>&1; then
    echo "Docker is not available (not installed, or not running)."
    echo "Using the PostgreSQL installed on this computer instead."
    echo "If you normally use Docker, stop here (Ctrl+C), start it with 'sudo systemctl start docker' and run this again."
    echo
    exec node scripts/run-local.mjs
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "Docker is installed but not running, and Node.js was not found."
    echo "Start Docker ('sudo systemctl start docker') or install Node.js 20.19+ and PostgreSQL, then run this again."
    exit 1
  fi
  echo "Docker is not installed (and neither is Node.js, which would allow running without it)."
  read -r -p "Install Docker now? (needs internet and sudo) [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
  curl -fsSL https://get.docker.com | sudo sh
  sudo systemctl enable --now docker
  DOCKER="sudo docker"
fi

echo "Starting Sheep Portal. The first run takes a few minutes..."
$DOCKER compose up -d --build

echo "Waiting for the site to come up..."
until curl -fs -o /dev/null http://localhost:3000; do sleep 3; done

echo
echo "Sheep Portal is running at http://localhost:3000"
echo "It restarts by itself when the computer restarts. Run ./stop-sheep-portal.sh to stop it."
xdg-open http://localhost:3000 >/dev/null 2>&1 || true
