# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Node.js** must be activated before running any command:
```bash
export FNM_PATH="$HOME/.local/share/fnm" && eval "$(/home/void/.local/bin/fnm env --shell bash)"
```

**Dev server** (reads `.env.local` automatically):
```bash
npm run dev
```

**Type check / Lint:**
```bash
npm run typecheck
npm run lint
```

**Build:**
```bash
npm run build
```

**Database migrations** (after editing `prisma/schema.prisma`):
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/overra" npm run db:migrate -- --name <migration-name>
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/overra" npm run db:generate
```

**Prisma Studio:**
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/overra" npm run db:studio
```

## Environment variables

`.env.local` (not committed) must contain:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/overra"
JWT_SECRET="<32+ char secret>"         # signs agent JWTs
NEXTAUTH_SECRET="<secret>"             # signs portal session JWTs
NEXTAUTH_URL="http://localhost:3000"
RESEND_API_KEY="<resend api key>"      # password reset email delivery
EMAIL_FROM="Overra <noreply@your-verified-domain.tld>"
APP_URL="http://localhost:3000"        # optional, falls back to NEXTAUTH_URL
```
`REDIS_URL`, `WEBSOCKET_PORT`, and `JWT_REFRESH_SECRET` are present in `.env.local` but currently unused — the app runs without them.

Password reset emails require `RESEND_API_KEY` and `EMAIL_FROM`. The sender domain must be verified in Resend (SPF + DKIM via the records Resend provides) or messages will go to spam.

## Architecture

### Overview
Overra is an **endpoint containment platform**. The portal (Next.js) lets security operators remotely lock down compromised machines. An agent installed on each endpoint polls the portal for its containment state and executes actions (disable network, lock screen, etc.) locally. Containment actions can optionally require an EIP-191 wallet signature to authorize.

### Prisma 7 (breaking changes from v5)
- `prisma/schema.prisma` datasource block has **no `url` field** — the connection URL lives in `prisma.config.ts` (for migrations) and in the `PrismaPg` adapter instantiation in `src/lib/prisma.ts` (for the runtime client).
- The generated client is at `src/generated/prisma/` (not `node_modules`).
- `PrismaClient` constructor requires a Driver Adapter — **never** pass `datasourceUrl` directly. Use `new PrismaPg({ connectionString })` from `@prisma/adapter-pg`.
- After any schema change: run `prisma migrate dev` then `prisma generate`.
- Prisma 7 type inference is stricter; `as any` casts appear in several places where the generated types don't align with what pages pass as props. This is a known Prisma 7 issue, not a code smell.

### Authentication flow
- **Portal users**: NextAuth.js v4, Credentials provider, JWT strategy. Session shape is extended in `src/types/next-auth.d.ts` to include `id`, `walletAddress`, and `plan`.
- **Agents**: Long-lived JWT signed with `JWT_SECRET`, containing `{ device_id, user_id, raw_token }`. Verified server-side by `src/lib/agent-auth.ts:verifyAgentToken()`. All agent API routes call this before doing anything.
- **Wallet auth**: EIP-191 signatures via ethers v6 `ethers.verifyMessage(message, signature)`. Used both to link a wallet to a user account (`/api/auth/wallet/link`) and to authorize containment enter/release on devices that have a `walletAuthority` set.

### Real-time (no Redis)
`src/lib/events.ts` is an in-process SSE broadcaster singleton (stored on `globalThis` to survive HMR). It holds a `Map<userId, Set<SSEClient>>`. When containment state changes or a new audit log is written, the relevant API route calls `broadcaster.broadcastToUser(userId, eventName, data)`. The browser connects to `/api/events` (a streaming `ReadableStream` response) and receives these events. The `useSSE` hook wires them into the Zustand store.

Three event types: `device:status_update`, `log:new_entry`, `device:heartbeat`.

> Note: `bullmq`, `ioredis`, and `socket.io` are listed in `package.json` but are **not used**. The project intentionally uses in-process SSE + direct PostgreSQL instead.

### Agent lifecycle
1. Operator generates a one-time download token via `POST /api/downloads/generate`.
2. Installer script hits `POST /api/agent/authenticate` with the token → receives a 365-day agent JWT + `device_id`.
3. Agent polls `POST /api/agent/heartbeat` (Bearer JWT) — response includes current containment state flags (`network_disabled`, `screen_locked`, etc.) so the agent can enforce them locally.
4. Agent reports execution results via `POST /api/agent/action/result`.

**Token revocation**: Setting `device.agentTokenHash = null` in the DB immediately invalidates a specific device's JWT without rotating `JWT_SECRET` for all other agents. `verifyAgentToken()` checks this after signature validation.

**Wallet signature message format** for EIP-191 containment auth (hardcoded in containment enter/release routes):
```
Overra Containment Activate: device=<uuid> ts=<epoch_ms>
```
TTL is 5 minutes. The server verifies the device UUID in the message matches the route param before checking the signature.

### State management
Zustand store at `src/store/device-store.ts` holds `devices[]`, `currentDevice`, and `logs[]`. SSE events mutate this store directly (e.g., `updateDeviceStatus`, `prependLog`). Server-rendered pages pass initial data as props; client components hydrate from those props on mount.

### Route groups
- `(auth)` — unauthenticated pages (login, signup).
- `(dashboard)` — authenticated pages. `layout.tsx` checks session server-side and redirects to `/login` if missing. Sidebar is `position: fixed`; `<main>` uses `marginLeft: "220px"` (inline styles, **not** Tailwind responsive classes — Tailwind v4 responsive utilities had a rendering issue in this project).
- All dashboard pages export `export const dynamic = "force-dynamic"` to prevent Next.js from caching DB reads.

### Next.js 16 async params
This project runs Next.js 16 / React 19. Route segment `params` is always a `Promise` — every page and route handler must `await params` before accessing properties:
```ts
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

### Toast notifications
`toast()` from `@/hooks/use-toast` is a **plain function** (not a hook). It uses a global setter reference set by `useToastState()` which is called once inside `ToastContainer`. Call `toast({ title, description?, variant? })` from anywhere on the client. Variants: `"default"`, `"success"`, `"error"`.

### Design tokens
All colors are defined as inline hex values (not Tailwind theme tokens) to avoid Tailwind v4 JIT scanning issues. The actual palette used throughout the codebase:
- Page background: `#060C18`
- Card/surface: `#131F32`, border: `#1C2E4A`
- Text primary: `#E8F0FF`, secondary: `#6B84A8`, muted: `#364D6A`
- Accent blue: `#4878FF`, green: `#00D68F`, red: `#FF3355`, amber: `#FFA800`
