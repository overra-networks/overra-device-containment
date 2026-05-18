# Deploying the Overra Portal on a VPS (Ubuntu, native systemd + nginx)

Target: Ubuntu 22.04 / 24.04. Stack: Next.js 16 (`next start`) behind nginx
(TLS via Let's Encrypt), PostgreSQL on the same box, run by systemd.

> **Read this first — known gaps this deploy does NOT fix.**
> Your prod-readiness backlog has two Tier-1 items that go live the moment
> agents talk to this box:
> 1. **Plain-HTTP agent code path.** `overra-agent/client.go` only *warns*
>    on non-localhost HTTP. This runbook forces TLS at the portal, but the
>    agent will still happily talk HTTP if pointed at one. Fix `client.go`
>    to hard-fail on non-`localhost` HTTP **before** distributing agents.
> 2. **Duplicate device rows on reinstall.** Unaffected by deployment.
>    Operators will see dupes until `/api/agent/authenticate` upserts by
>    `userId+hostname+os`.
> Deploying is fine for staging / first pilots. Do not onboard external
> paying customers until #1 is closed.

Throughout, replace `portal.example.com` with your real domain.

---

## 0. Prerequisites

- A VPS with a public IP and SSH access as a non-root sudo user.
- DNS **A record** (and `AAAA` if you have IPv6) for `portal.example.com`
  pointing at the VPS IP. Verify before requesting a cert:
  `dig +short portal.example.com` → your VPS IP.
- The private repo is cloneable from the box. Either:
  - add a **read-only deploy key** (GitHub → repo → Settings → Deploy keys)
    and clone via SSH, or
  - `gh auth login` on the box and clone via HTTPS.

## 1. Base system

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw nginx
```

## 2. Node.js 20 (NodeSource — system-wide, systemd-friendly)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # expect v20.x
```

## 3. PostgreSQL

```bash
sudo apt install -y postgresql
sudo -u postgres psql <<'SQL'
CREATE ROLE overra LOGIN PASSWORD 'CHANGE_ME_DB_PASSWORD';
CREATE DATABASE overra OWNER overra;
SQL
```

The `overra` role **owns** the `overra` DB (needed so `prisma migrate
deploy` can create tables). It is not a superuser. Postgres listens on
localhost only by default — leave it that way; do not expose 5432.

## 4. App user + code

```bash
sudo useradd --system --create-home --home-dir /opt/overra --shell /usr/sbin/nologin overra
sudo mkdir -p /opt/overra/app
sudo chown -R overra:overra /opt/overra

# Clone as the overra user (use the deploy key / gh auth from step 0).
sudo -u overra git clone https://github.com/overra-networks/overra-device-containment.git /opt/overra/app
cd /opt/overra/app
```

## 5. Environment file

```bash
sudo -u overra cp deploy/.env.production.example /opt/overra/app/.env.production
sudo -u overra nano /opt/overra/app/.env.production    # fill every CHANGE_ME
sudo chmod 600 /opt/overra/app/.env.production
```

Generate `JWT_SECRET` / `NEXTAUTH_SECRET`:
`openssl rand -base64 48 | tr -d '\n'; echo`

Set `DATABASE_URL` to the role/password from step 3. Leave
`NEXTAUTH_URL`/`APP_URL` as `https://portal.example.com` — the cert in
step 8 makes that real.

## 6. Build

Prisma 7's client is generated into `src/generated/prisma` (gitignored),
so it **must** be generated on the box before the Next build.

```bash
cd /opt/overra/app
sudo -u overra npm ci
set -a; source /opt/overra/app/.env.production; set +a
sudo -u overra --preserve-env=DATABASE_URL npx prisma generate
sudo -u overra --preserve-env=DATABASE_URL npm run db:deploy   # prisma migrate deploy
sudo -u overra --preserve-env=NODE_ENV,DATABASE_URL npm run build
```

`npm run db:deploy` applies the committed migrations
(`prisma/migrations/`) — it never generates new ones (that's `db:migrate`,
dev-only). Re-running it is safe and idempotent.

## 7. systemd service

```bash
sudo cp deploy/overra-portal.service /etc/systemd/system/overra-portal.service
sudo systemctl daemon-reload
sudo systemctl enable --now overra-portal
sudo systemctl status overra-portal --no-pager
sudo journalctl -u overra-portal -f         # watch startup; Ctrl-C to stop
curl -fsS http://127.0.0.1:3000/api/events -m 2 || true   # should connect
```

If it fails with a read-only-filesystem error, the hardening is too tight
for your Node version — relax `ProtectSystem=strict` to `full` in the unit
and `daemon-reload` + restart.

## 8. nginx + TLS

```bash
sudo cp deploy/nginx-overra.conf /etc/nginx/sites-available/overra
sudo sed -i 's/__DOMAIN__/portal.example.com/g' /etc/nginx/sites-available/overra
sudo ln -s /etc/nginx/sites-available/overra /etc/nginx/sites-enabled/overra
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d portal.example.com --redirect --agree-tos -m you@example.com
sudo systemctl list-timers | grep certbot      # auto-renew is installed
```

certbot rewrites the site config to add the `:443` server and an
HTTP→HTTPS redirect. The SSE block for `/api/events` is preserved.

## 9. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Port 3000 and 5432 are NOT opened — both stay loopback-only.

## 10. Smoke test

```bash
curl -I https://portal.example.com                       # 200/redirect, valid cert
```

Then in a browser: sign up, log in, generate an agent download token, and
confirm the installer URL is `https://portal.example.com/...`. Point a
test agent at the HTTPS domain and confirm it appears + contains.

## 11. Redeploying after a code change

```bash
cd /opt/overra/app
sudo -u overra git pull
sudo -u overra npm ci
set -a; source /opt/overra/app/.env.production; set +a
sudo -u overra --preserve-env=DATABASE_URL npx prisma generate
sudo -u overra --preserve-env=DATABASE_URL npm run db:deploy
sudo -u overra --preserve-env=NODE_ENV,DATABASE_URL npm run build
sudo systemctl restart overra-portal
```

There is a few-seconds blip on restart (single instance, no blue/green).
Acceptable at this scale; revisit with a second port + nginx upstream swap
if you need zero-downtime.

## 12. Backups (do this before real data exists)

```bash
sudo mkdir -p /opt/overra/backups && sudo chown overra:overra /opt/overra/backups
sudo -u overra crontab -e
# add — daily 03:00, 14-day retention:
0 3 * * * pg_dump -Fc overra > /opt/overra/backups/overra-$(date +\%F).dump && find /opt/overra/backups -name '*.dump' -mtime +14 -delete
```

A local dump on the same VPS is not a real backup. Ship these off-box
(object storage / another host) before onboarding anyone who matters.

## 13. Post-deploy security checklist

- [ ] `https://` enforced, HTTP redirects, cert valid (`certbot renew --dry-run`)
- [ ] `.env.production` is `chmod 600`, owned by `overra`, not in git
- [ ] DB role is not a superuser; 5432 not publicly reachable
- [ ] `JWT_SECRET` / `NEXTAUTH_SECRET` are freshly generated, not the dev values
- [ ] Port 3000 not exposed (`sudo ss -tlnp | grep 3000` → 127.0.0.1 only)
- [ ] `overra-agent/client.go` hard-fails on non-localhost HTTP **(Tier-1 #1)**
- [ ] Off-box backups verified by a test restore
