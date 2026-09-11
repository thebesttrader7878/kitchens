#!/bin/zsh
# Start (or restart) the Kitchens hall + dashboard on port 8765.
set -e
PORT=8765
cd "$(dirname "$0")"
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
pids=$(lsof -nP -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "$pids" ]]; then
  echo "Port $PORT busy — stopping old server ($pids)"
  kill $pids 2>/dev/null || true
  sleep 0.4
fi
echo "Kitchens  → http://localhost:$PORT"
echo "Dashboard → http://localhost:$PORT/dashboard.html"
echo "Default password: wilsons"
exec python3 server.py
