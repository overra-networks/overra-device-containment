#!/usr/bin/env bash
# Agent <-> portal contract test runner.
#
# 1. Boots Next.js (production build, port 3001) if not already running.
# 2. Seeds the test DB with one device + signed agent JWT.
# 3. Runs the Go contract test with the JWT/URL/DB-URL in env.
# 4. Tears down whatever it started.
#
# Usage:   bash tests/agent-contract/run.sh
# CI hint: must run with FNM-activated Node 20 and PostgreSQL reachable.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${E2E_PORT:-3001}"
BASE_URL="http://localhost:${PORT}"
SEED_OUT="$(mktemp)"
SERVER_PID=""
WE_STARTED_SERVER=0

cleanup() {
  if [[ "$WE_STARTED_SERVER" == "1" && -n "$SERVER_PID" ]]; then
    echo "[contract] stopping next server (pid=$SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$SEED_OUT"
}
trap cleanup EXIT

cd "$ROOT"

# Activate fnm if available - same pattern as CLAUDE.md / npm run dev.
if [[ -d "$HOME/.local/share/fnm" ]]; then
  export FNM_PATH="$HOME/.local/share/fnm"
  eval "$("$HOME/.local/bin/fnm" env --shell bash)" || true
fi

# Load .env.test so DATABASE_URL etc. are available to subprocesses.
if [[ -f .env.test ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
else
  echo "[contract] .env.test missing - copy .env.test.example first"
  exit 1
fi

if [[ ! "$DATABASE_URL" =~ overra_test ]]; then
  echo "[contract] refused: DATABASE_URL does not point at overra_test"
  exit 1
fi

server_up() {
  local code
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/devices" || true)
  [[ "$code" == "200" || "$code" == "401" ]]
}

if server_up; then
  echo "[contract] reusing existing server at $BASE_URL"
else
  if [[ ! -d .next-e2e ]]; then
    echo "[contract] building Next.js (.next-e2e) - first run takes ~60s"
    E2E_DIST_DIR=.next-e2e npx next build
  fi
  echo "[contract] starting Next.js on port $PORT"
  E2E_DIST_DIR=.next-e2e npx next start --port "$PORT" >/tmp/overra-contract-server.log 2>&1 &
  SERVER_PID=$!
  WE_STARTED_SERVER=1

  for _ in $(seq 1 60); do
    if server_up; then
      break
    fi
    sleep 0.5
  done
  if ! server_up; then
    echo "[contract] server did not become ready in 30s - log:"
    tail -50 /tmp/overra-contract-server.log
    exit 1
  fi
fi

echo "[contract] seeding test DB"
node tests/agent-contract/seed.mjs >"$SEED_OUT"

OVERRA_API_URL=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).api_url)" "$SEED_OUT")
OVERRA_AGENT_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).agent_token)" "$SEED_OUT")
OVERRA_DEVICE_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).device_id)" "$SEED_OUT")
OVERRA_USER_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).user_id)" "$SEED_OUT")
export OVERRA_API_URL OVERRA_AGENT_TOKEN OVERRA_DEVICE_ID OVERRA_USER_ID DATABASE_URL

echo "[contract] running go test -tags=contract"
cd overra-agent
go test -tags=contract -v -run TestAgentPortalContract ./...
