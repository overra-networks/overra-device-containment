#!/usr/bin/env bash
# Smoke test the full agent download/install pipeline against a real portal.
#
# What it asserts (in order):
#   1. /api/downloads/<token> returns an installer script for each platform
#   2. The Linux installer can run /api/agent/authenticate and get a JWT
#   3. The Windows installer script is PowerShell-shaped
#   4. With the JWT, /api/agent/binary?os=X&arch=Y returns the binary bytes
#   5. The downloaded bytes match the on-disk sha256 of agents/<filename>
#   6. Without a JWT, /api/agent/binary returns 401
#   7. With a bad os/arch combo, /api/agent/binary returns 400
#   8. /api/agent/binary?os=windows&arch=arm64 returns 404 (intentional gap)
#
# Usage:   bash tests/agent-contract/download-smoketest.sh
# Requires the same env as run.sh (a portal on $E2E_PORT and .env.test).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${E2E_PORT:-3001}"
BASE_URL="http://localhost:${PORT}"
SEED_OUT="$(mktemp)"
DOWNLOADED="$(mktemp)"
SERVER_PID=""
WE_STARTED_SERVER=0
FAIL=0

cleanup() {
  if [[ "$WE_STARTED_SERVER" == "1" && -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$SEED_OUT" "$DOWNLOADED"
}
trap cleanup EXIT

cd "$ROOT"

if [[ -d "$HOME/.local/share/fnm" ]]; then
  export FNM_PATH="$HOME/.local/share/fnm"
  eval "$("$HOME/.local/bin/fnm" env --shell bash)" || true
fi

if [[ -f .env.test ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
fi

if [[ ! "$DATABASE_URL" =~ overra_test ]]; then
  echo "[smoke] refused: DATABASE_URL does not point at overra_test"
  exit 1
fi

server_up() {
  local code
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/devices" || true)
  [[ "$code" == "200" || "$code" == "401" ]]
}

if server_up; then
  echo "[smoke] reusing existing server at $BASE_URL"
else
  if [[ ! -d .next-e2e ]]; then
    echo "[smoke] building Next.js (.next-e2e) - first run takes ~60s"
    E2E_DIST_DIR=.next-e2e npx next build
  fi
  echo "[smoke] starting Next.js on port $PORT"
  E2E_DIST_DIR=.next-e2e npx next start --port "$PORT" >/tmp/overra-smoke-server.log 2>&1 &
  SERVER_PID=$!
  WE_STARTED_SERVER=1
  for _ in $(seq 1 60); do
    if server_up; then break; fi
    sleep 0.5
  done
  if ! server_up; then
    echo "[smoke] server did not become ready in 30s"
    tail -50 /tmp/overra-smoke-server.log
    exit 1
  fi
fi

# Verify on-disk binaries exist. The download endpoint streams them straight
# from agents/, so a missing build means the endpoint 404s and the install
# script silently fails downstream.
required_binaries=(
  "agents/overra-agent-linux-amd64"
  "agents/overra-agent-linux-arm64"
  "agents/overra-agent-darwin-amd64"
  "agents/overra-agent-darwin-arm64"
  "agents/overra-agent-windows-amd64.exe"
)
echo "[smoke] checking on-disk binaries"
for b in "${required_binaries[@]}"; do
  if [[ ! -f "$b" ]]; then
    echo "  MISSING: $b - run 'make all' in overra-agent/"
    FAIL=1
  fi
done
if [[ "$FAIL" == "1" ]]; then exit 1; fi

echo "[smoke] seeding DB with one download token per platform"
node - <<'NODE' > "$SEED_OUT"
import { config } from "dotenv";
import path from "node:path";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.test"), override: true, quiet: true });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`TRUNCATE TABLE "audit_logs", "agent_downloads", "containment_configs", "devices", "users" RESTART IDENTITY CASCADE`);
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash("smoke", 4);
  await client.query(
    `INSERT INTO "users" (id, email, password_hash, name, plan, created_at, updated_at)
     VALUES ($1, 'smoke@example.com', $2, 'Smoke', 'free', NOW(), NOW())`,
    [userId, passwordHash]
  );
  const tokens = {};
  for (const platform of ["linux", "macos", "windows"]) {
    const tok = randomUUID();
    await client.query(
      `INSERT INTO "agent_downloads" (id, user_id, platform, version, download_token, activated, created_at)
       VALUES ($1, $2, $3::"Platform", 'v0.2', $4, false, NOW())`,
      [randomUUID(), userId, platform, tok]
    );
    tokens[platform] = tok;
  }
  process.stdout.write(JSON.stringify(tokens) + "\n");
} finally {
  await client.end();
}
NODE

LINUX_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).linux)" "$SEED_OUT")
MACOS_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).macos)" "$SEED_OUT")
WIN_TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).windows)" "$SEED_OUT")

check() {
  local name="$1"; shift
  if "$@"; then
    echo "  [OK]   $name"
  else
    echo "  [FAIL] $name"
    FAIL=1
  fi
}

echo "[smoke] step 1: install script per platform"
check "linux script has authenticate POST" bash -c "curl -sf '$BASE_URL/api/downloads/$LINUX_TOKEN' | grep -q '/agent/authenticate'"
check "macos script has authenticate POST" bash -c "curl -sf '$BASE_URL/api/downloads/$MACOS_TOKEN' | grep -q '/agent/authenticate'"
check "windows script is PowerShell"       bash -c "curl -sf '$BASE_URL/api/downloads/$WIN_TOKEN' | grep -q 'Invoke-RestMethod'"

echo "[smoke] step 2: authenticate as a linux agent -> get JWT"
AUTH_RESP=$(curl -sf -X POST "$BASE_URL/api/agent/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"download_token\":\"$LINUX_TOKEN\",\"hostname\":\"smoke-host\",\"os\":\"linux\",\"agent_version\":\"v0.2\"}")
AGENT_TOKEN=$(echo "$AUTH_RESP" | node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).agent_token))")
check "got an agent JWT" test -n "$AGENT_TOKEN"

echo "[smoke] step 3-5: download binary with JWT and verify sha256 matches disk"
curl -sf -H "Authorization: Bearer $AGENT_TOKEN" \
  "$BASE_URL/api/agent/binary?os=linux&arch=amd64" -o "$DOWNLOADED"

DISK_SUM=$(sha256sum agents/overra-agent-linux-amd64 | awk '{print $1}')
WIRE_SUM=$(sha256sum "$DOWNLOADED" | awk '{print $1}')
check "downloaded linux/amd64 bytes match disk" test "$DISK_SUM" = "$WIRE_SUM"

echo "[smoke] step 6: binary endpoint refuses unauthenticated requests"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/agent/binary?os=linux&arch=amd64")
check "no Bearer token returns 401" test "$CODE" = "401"

echo "[smoke] step 7: bad os/arch returns 400"
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  "$BASE_URL/api/agent/binary?os=plan9&arch=amd64")
check "invalid os returns 400" test "$CODE" = "400"

echo "[smoke] step 8: windows/arm64 returns 404 (intentional gap)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  "$BASE_URL/api/agent/binary?os=windows&arch=arm64")
check "windows/arm64 returns 404" test "$CODE" = "404"

echo
if [[ "$FAIL" == "0" ]]; then
  echo "[smoke] PASS - download pipeline works end-to-end"
  exit 0
else
  echo "[smoke] FAIL - see above"
  exit 1
fi
