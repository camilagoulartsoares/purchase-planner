#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "→ Backend em http://localhost:3334"
(cd "$ROOT/backend" && npm run dev) &
BACK_PID=$!

echo "→ Frontend em http://localhost:5173"
(cd "$ROOT/frontend" && npm run dev) &
FRONT_PID=$!

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null || true' EXIT
wait
