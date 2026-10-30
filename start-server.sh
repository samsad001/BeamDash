#!/usr/bin/env bash
# BeamDash server for Linux. Extra options are passed through, for example:
#   ./start-server.sh --port 8080
#   ./start-server.sh --game-host 192.168.1.60   (BeamNG runs on another machine)
#   ./start-server.sh --demo off                 (never show the demo car)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 18+ (e.g. 'sudo apt install nodejs' or https://nodejs.org) and run this again."
  exit 1
fi
exec node server/server.js "$@"
