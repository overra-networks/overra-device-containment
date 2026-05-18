# Tests

Three layers, separate runners:

- `tests/unit/**` — pure-function unit tests (vitest, no DB).
- `tests/integration/**` — API route + DB tests (vitest, hits a real Postgres test DB).
- `tests/e2e/**` — Playwright browser tests against `npm run dev` on port 3001.

## One-time setup

```bash
# 1. Create the test database
createdb overra_test

# 2. Configure test env
cp .env.test.example .env.test
# (edit if your local Postgres credentials differ)

# 3. Apply schema to the test DB
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/overra_test" \
  npm run db:migrate -- --name init

# 4. Install Playwright browsers (one-time)
npx playwright install chromium
```

## Running tests

```bash
npm test                 # unit + integration (vitest, watch mode)
npm run test:run         # unit + integration (single run, for CI)
npm run test:unit        # unit only
npm run test:integration # integration only
npm run test:coverage    # with coverage report
npm run test:e2e         # Playwright E2E (builds to .next-e2e, runs on port 3001)
npm run test:e2e:ui      # Playwright UI mode for debugging
```

## E2E coexistence with `npm run dev`

Playwright runs `next build && next start` against a separate dist dir
(`.next-e2e`, set via `E2E_DIST_DIR` env var read by `next.config.ts`). This
means E2E **can** run alongside an active `npm run dev` — no `.next/dev/lock`
conflict. First run takes ~60 s for the production build; subsequent runs
with `reuseExistingServer: true` skip the build if port 3001 is already up.

The E2E user (`e2e@example.com` / `supersecret`) is seeded by
`tests/e2e/global-setup.ts` before each run. The DB is truncated then
re-seeded on every `npm run test:e2e` invocation, so tests start from a
known state.

## Why the DATABASE_URL guard?

Both `tests/setup.ts` and `tests/helpers/db.ts` refuse to run unless `DATABASE_URL`
contains the literal substring `overra_test`. This prevents truncating tables on
the dev database by accident. If you rename the test DB, update the guard.

## Agent contract test

`tests/agent-contract/` exercises the real HTTP boundary between the Go agent
(`overra-agent/`) and the Next.js portal. Unlike `tests/integration/agent/**`,
which call route handlers in-process, this test:

1. Boots Next.js on port 3001 (reusing the `.next-e2e` production build).
2. Seeds one device + a valid agent JWT via `tests/agent-contract/seed.mjs`.
3. Runs `go test -tags=contract -run TestAgentPortalContract` from
   `overra-agent/`, which drives the agent's real HTTP client against the
   running portal while flipping device state in Postgres between ticks.

```bash
npm run test:agent-contract
# or
bash tests/agent-contract/run.sh
```

The runner reuses an existing server on port 3001 if one is already up (e.g.,
from a Playwright session), otherwise it starts and tears down its own.

What it asserts:

| Step | Setup | Expectation |
| --- | --- | --- |
| 1 | Fresh seed, status=normal | tick returns `"normal"`, no actions fire |
| 2 | DB flip: contained + network_disable + screen_lock | tick returns `"contained"`, only flagged actions fire — exactly once |
| 3 | Same DB state, second tick | actions do NOT re-fire (dedup via applied set) |
| 4 | DB flip back to normal | release hooks fire only for previously-applied actions |
| 5 | After release | `audit_logs` row count has grown (ReportResult delivered) |
| 6 | DB flip: `agent_token_hash = NULL` | next Heartbeat returns `ErrUnauthorized` |

The Go test file is guarded by `//go:build contract`, so a plain
`go test ./...` in `overra-agent/` skips it entirely. Likewise, running
`go test -tags=contract` without the env vars set causes the test to skip
with a clear message rather than fail.
