# Overra

Endpoint containment platform. The portal (Next.js) lets a security operator
remotely lock down a compromised machine; a small Go agent installed on each
endpoint polls the portal for its containment state and executes actions
(disable network, lock screen, etc.) locally. Containment actions can
optionally require an EIP-191 wallet signature to authorize.

> **Status:** MVP. Agent ↔ portal contract test passes. Not yet hardened for
> external paying customers — Tier-1 open items (duplicate-device on
> reinstall, systemd auto-enable, macOS Accessibility gap) must close first.

## Architecture

```
┌──────────────────┐   HTTPS (Bearer JWT)   ┌──────────────────────┐
│  overra-agent    │ ─────────────────────▶ │  Next.js portal      │
│  (Go, cross-OS)  │ ◀───────────────────── │  /api/agent/*        │
└──────────────────┘   poll & exec actions  │  /api/devices/*      │
                                            │  /api/events (SSE)   │
                                            └──────────┬───────────┘
                                                       │
                                                       ▼
                                                 PostgreSQL
```

- **Portal**: Next.js 16 App Router · TypeScript · Tailwind v4 · Prisma 7 ·
  PostgreSQL 18 · NextAuth v4 (credentials + EIP-191 wallet linking).
- **Real-time**: in-process SSE broadcaster on `globalThis`. No Redis, no
  WebSockets — three event types (`device:status_update`, `log:new_entry`,
  `device:heartbeat`) push from API routes straight to subscribed browsers.
- **Agent**: single Go binary, cross-compiled for `{linux,darwin,windows} ×
  {amd64,arm64}` (Windows arm64 excluded — CGo dep). Installs itself as a
  system service via `kardianos/service` (systemd / launchd / Windows Service).
- **Auth**:
  - Operator session: NextAuth JWT.
  - Agent: 365-day JWT signed with `JWT_SECRET`, revocable by nulling
    `device.agentTokenHash` (no global rotation needed).
  - Containment authorization (optional): EIP-191 signature on
    `Overra Containment Activate: device=<uuid> ts=<epoch_ms>` (5-min TTL).

## Repository layout

```
overra/
├── src/                     # Next.js portal
│   ├── app/(auth|dashboard) # route groups
│   ├── app/api/             # REST + SSE endpoints
│   ├── lib/                 # prisma, auth, events, agent-auth
│   └── store/               # zustand
├── overra-agent/            # Go agent source
├── agents/                  # cross-compiled binaries (committed; served by /api/agent/binary)
├── prisma/                  # schema + migrations
├── deploy/                  # systemd unit, nginx conf, DEPLOY.md runbook
└── tests/agent-contract/    # live agent ↔ portal contract test
```

## Quick start (local dev)

Prereqs: Node 20 (fnm), PostgreSQL 18, Go 1.22+ if rebuilding the agent.

```bash
# Activate Node 20
export FNM_PATH="$HOME/.local/share/fnm"
eval "$(/home/void/.local/bin/fnm env --shell bash)"

# .env.local — required keys:
#   DATABASE_URL, JWT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL,
#   RESEND_API_KEY, EMAIL_FROM
cp .env.example .env.local && $EDITOR .env.local

npm ci
npm run db:migrate
npm run dev   # http://localhost:3000
```

### Rebuild the agent (only if you change `overra-agent/`)

```bash
cd overra-agent && make all       # outputs to ../agents/
cd ../agents && sha256sum overra-agent-* > SHA256SUMS.txt
```

Commit the refreshed `agents/` + `SHA256SUMS.txt` whenever agent source
changes; `/api/agent/binary` serves files directly from this directory.

## Agent enrollment flow

1. Operator clicks **Generate installer** → `POST /api/downloads/generate`
   returns a one-time `downloadToken` and a URL.
2. Operator runs the installer on the endpoint:
   ```
   curl -fsSL https://portal/api/downloads/<token> | sudo bash   # linux / macOS
   iwr https://portal/api/downloads/<token> -OutFile install.ps1 # windows
   ```
3. Installer exchanges the token at `POST /api/agent/authenticate` →
   receives a 365-day agent JWT + `device_id`.
4. Installer downloads the matching binary from
   `GET /api/agent/binary?os=…&arch=…` (Bearer JWT required).
5. Binary installs itself as a system service and starts heartbeating
   (`POST /api/agent/heartbeat`).

## Scripts

| Command                       | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `npm run dev`                 | Next.js dev server                                      |
| `npm run build` / `start`     | Production build + serve                                |
| `npm run typecheck` / `lint`  | TS + ESLint                                             |
| `npm run db:migrate`          | Apply Prisma migrations (dev)                           |
| `npm run db:deploy`           | Apply migrations (prod, non-interactive)                |
| `npm run db:studio`           | Prisma Studio                                           |
| `npm run test`                | Vitest (unit + integration)                             |
| `npm run test:e2e`            | Playwright                                              |
| `npm run test:agent-contract` | Boots portal + seeds a device, runs Go contract test    |

## Deployment

Production target: Ubuntu 22.04/24.04, native systemd + nginx + Let's Encrypt,
PostgreSQL on the same box. Step-by-step runbook lives in
[`deploy/DEPLOY.md`](deploy/DEPLOY.md). Artifacts:

- `deploy/overra-portal.service` — systemd unit, runs `next start` bound to
  127.0.0.1:3000 with hardening flags (`NoNewPrivileges`, `PrivateTmp`, …).
- `deploy/nginx-overra.conf` — TLS termination + reverse proxy.

Redeploy on a configured VPS:

```bash
cd /opt/overra/app
sudo -u overra git pull
sudo -u overra --preserve-env=NODE_ENV,DATABASE_URL npm ci
sudo -u overra --preserve-env=NODE_ENV,DATABASE_URL npm run build
sudo systemctl restart overra-portal
```

## Prisma 7 gotchas

Prisma 7 has breaking changes vs v5 — read before touching the schema:

- `prisma/schema.prisma` datasource block has **no `url` field** — connection
  URL lives in `prisma.config.ts` (migrations) and in the `PrismaPg` adapter
  in `src/lib/prisma.ts` (runtime).
- `PrismaClient` requires a Driver Adapter — never pass `datasourceUrl`.
  Use `new PrismaPg({ connectionString })` from `@prisma/adapter-pg`.
- Generated client lives at `src/generated/prisma/`, not in `node_modules`.
- After schema changes: `npm run db:migrate -- --name <name>` then
  `npm run db:generate`.

Project-specific notes — design tokens, Tailwind v4 caveats, Next 16 async
`params`, toast usage — live in [`CLAUDE.md`](CLAUDE.md).

## Security model (short)

- All `/api/agent/*` routes validate the agent JWT via
  `src/lib/agent-auth.ts:verifyAgentToken()` before doing anything.
- The agent client (`overra-agent/client.go`) hard-fails if `APIBase` is
  plain HTTP unless the host is a genuine loopback address (no
  string-prefix bypass). The Bearer token never crosses the network in
  plaintext.
- Agent token revocation is per-device: null `device.agentTokenHash` to
  kill one agent without rotating `JWT_SECRET` for the rest.
- Containment-authorization wallet messages are bound to a specific device
  UUID and timestamp; replay is blocked by a 5-minute TTL.

## License

Proprietary — Overra Networks. No public license at this time.
