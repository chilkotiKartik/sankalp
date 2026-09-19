# Deployment

Two processes and a database: the Express API and the Next.js server. The API holds every
secret; the web server holds none and reaches the API over the private network.

```
        internet ──▶ TLS terminator / CDN ──▶ Next.js (:3000) ──▶ Express API (:4000) ──▶ PostgreSQL
                                                (no secrets)        (all secrets)
```

Only the Next.js server should be publicly reachable. The API should sit on a private
network; if it must be exposed, restrict `APP_ORIGIN` and put it behind the same TLS
terminator.

---

## Environment variables

`.env.example` is the authoritative list. Everything here is read and validated once at
startup by `packages/config/src/server-env.ts`; a bad value fails the boot with a clear
message rather than surfacing later as a runtime error.

### Core

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on the stricter checks below |
| `PORT` | `4000` | API port |
| `APP_ORIGIN` | `http://localhost:3000` | Comma-separated CORS allow-list |
| `LOG_LEVEL` | `info` | pino level |
| `DEMO_MODE` | `true` | Sample location and scenario shortcuts. **Set `false` in production** |
| `PROVIDER_MODE` | `auto` | `auto` uses a real provider whenever its key is present; `mock` forces local fallbacks |
| `REGION_ID` | `gurugram` | Selects the region config and curated directory |

### Database

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PERSISTENCE` | `auto` | `auto` \| `postgres` \| `memory`. `auto` falls back to memory only when `DEMO_MODE=true` |
| `DATABASE_POOL_MAX` | `10` | Connections held by **one** instance of the process. Set `1`–`2` on a serverless host and pool in front of Postgres |
| `RETENTION_DAYS` | `7` | Conversations are deleted after this; `0` means one day |

### Security

| Variable | Notes |
|---|---|
| `JWT_SECRET` | **Required in production.** `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `DATA_ENCRYPTION_KEY` | **Required in production.** 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `SESSION_TTL_HOURS` | Default `720` (30 days) |
| `ADMIN_ACCESS_KEY` | Optional, ≥ 24 chars. Without it `/v1/auth/admin` and `/v1/admin/metrics` are unavailable |
| `CRON_SECRET` | Only for hosts with no long-lived process. Authorises the scheduled retention sweep at `/internal/purge`; without it that route returns 404 |
| `TRUST_PROXY` | Number of proxies in front of the API, so client IPs and rate limits are correct |
| `RATE_LIMIT_*` | See [API.md](API.md#rate-limits) |

In production the config layer refuses to start without `JWT_SECRET`,
`DATA_ENCRYPTION_KEY` and `DATABASE_URL`. That is deliberate: a production deployment
that silently fell back to in-memory storage and an ephemeral signing key would be worse
than one that did not start.

> **Rotating `DATA_ENCRYPTION_KEY`** invalidates existing ciphertext. Stored messages
> carry a `v1.` prefix so a future key version can be introduced without a flag day, but
> rotating today means old conversations can no longer be read. Purge first, or accept
> the loss.

### Providers (all optional)

| Variable | What it enables | Without it |
|---|---|---|
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | Understanding, speech-to-text **and** text-to-speech | Rules, templates and browser speech |
| `GEMINI_MODEL`, `GEMINI_STT_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_VOICE`, `GEMINI_VOICE_HI` | Model and voice selection | Sensible defaults |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_VOICE_ID_HI` | A dedicated low-latency voice, preferred over Gemini when set | Gemini voice, else browser speech |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude for understanding | Gemini if present, else rules |
| `AI_PROVIDER` | Pin the choice: `auto` (default, prefers Gemini), `gemini`, `anthropic`, `rules` | `auto` |
| `GOOGLE_MAPS_API_KEY` | Live hospital search and routed travel times | Curated Gurugram directory + estimates |

`AI_PROVIDER=gemini` or `=anthropic` fails the boot when the matching key is missing,
rather than silently degrading — if you pinned a provider, you meant it.

The Gemini integration targets the Interactions API and pins `Api-Revision: 2026-05-20`,
so a breaking change to the unpinned default cannot take the app down. Responses from the
older `models/*:generateContent` shape are parsed too.

Timeouts (`VOICE_TIMEOUT_MS`, `AI_TIMEOUT_MS`, `MAPS_TIMEOUT_MS`) bound every outbound
call; a provider that hangs degrades that one feature and nothing else.

Restrict the Google key to the **Places API (New)** and **Routes API** and to your server
IPs. It is used server-side only — it must not be an HTTP-referrer-restricted key.

### Web

| Variable | Notes |
|---|---|
| `API_INTERNAL_URL` | Where the Next.js server proxies `/api/*`. Server-side only |
| `NEXT_PUBLIC_MAP_TILE_URL` | Default: OpenStreetMap standard tiles — read their usage policy before running at any volume |
| `NEXT_PUBLIC_MAP_ATTRIBUTION` | Shown on the map; keep it accurate |

Only `NEXT_PUBLIC_*` variables reach the browser, and none of them is a secret.
`npm run check:secrets` scans the built client output for every server variable name and
exits non-zero if one appears — run it in CI.

---

## Database

```bash
npm run db:generate    # Prisma client (also runs on postinstall)
npm run db:migrate     # apply prisma/migrations
npm run db:seed        # curated facilities
```

`scripts/migrate.ts` tries `prisma migrate deploy` first and falls back to executing the
migration SQL directly, recording the same `_prisma_migrations` rows, for environments
where Prisma's engine binaries cannot be downloaded.

Prisma runs on `@prisma/adapter-pg`, so there is no Rust engine binary at runtime — the
container only needs Node.

### Retention

`npm run db:purge` deletes everything past `expiresAt`. Run it at least daily:

```
15 3 * * *  cd /app && npm run db:purge
```

---

## Running it without Docker

This is the supported default. Two Node processes and (optionally) PostgreSQL:

```bash
npm ci
npm run setup           # writes .env with generated secrets
npm run build           # Prisma client, typecheck, API bundle, Next build
npm run db:migrate      # only if DATABASE_URL is set
npm start               # API on :4000, web on :3000
```

For a server, run the two processes under whatever supervisor you already use —
systemd, pm2, or your platform's process manager:

```ini
# /etc/systemd/system/sanjeevani-api.service
[Service]
WorkingDirectory=/srv/sanjeevani
EnvironmentFile=/srv/sanjeevani/.env
ExecStart=/usr/bin/node apps/api/dist/index.js
Restart=always
User=sanjeevani

# /etc/systemd/system/sanjeevani-web.service
[Service]
WorkingDirectory=/srv/sanjeevani
Environment=API_INTERNAL_URL=http://127.0.0.1:4000
ExecStart=/usr/bin/node apps/web/.next/standalone/apps/web/server.js
Restart=always
User=sanjeevani
```

Put nginx, Caddy or your platform's load balancer in front of the web process for TLS,
and keep the API on localhost or a private interface.

The web build emits Next.js's self-contained server only when `NEXT_OUTPUT_STANDALONE=1`
is set (the Dockerfile sets it). Managed platforms build their own output and must not be
given it.

---

## Serverless (Vercel)

The same two pieces, hosted as two projects rather than two processes. Nothing about the
shape changes: the browser still talks only to the web origin, the web server still
proxies `/api/*` server-side, and the API still holds every secret.

```
   browser ──▶ sanjeevani-voice (Next.js)  ──▶ sanjeevani-api (one Node function) ──▶ Postgres
                    no secrets                        all secrets                    (pooled)
```

### The two projects

| | `sanjeevani-voice` | `sanjeevani-api` |
|---|---|---|
| Framework | Next.js | none — Build Output API v3 |
| Root directory | `apps/web` | repository root |
| Build command | `cd ../.. && npm run build:vercel-web` | `npm run build:vercel-api` |
| Region | `bom1` (Mumbai) | `bom1` (Mumbai) |

`scripts/build-vercel-api.mjs` runs the same `tsup` bundle the server build produces and
places it in `.vercel/output/`. Nothing is auto-detected, deliberately: the workspace
packages ship TypeScript source rather than compiled JavaScript, so no framework preset
can work out what to compile. The artefact deployed is the one that was tested.

### What a serverless host changes, and what is done about it

| Assumption that no longer holds | What replaces it |
|---|---|
| The process stays alive, so start-up is paid once | The container boot is cached per instance; a failed boot is **not** cached, so a transient database blip does not poison an instance for its lifetime |
| `setInterval` can run the hourly retention sweep | A daily scheduled call to `POST /internal/purge`, authorised by `CRON_SECRET` and constant-time compared. Without that secret the route returns 404 — a misconfigured deployment cannot leave a deletion endpoint open |
| One process means one connection pool | `DATABASE_POOL_MAX=2` and a transaction pooler in front of Postgres. Ten connections per instance is fine for one server and catastrophic for fifty |
| Rate limits are shared across all requests | They are per-instance, so the effective limit is looser than configured. Documented rather than hidden — see the note below |

### Database

Postgres must be reached through a **transaction pooler**, not a direct connection: a
direct connection per instance exhausts the server, and on some providers the direct
host is IPv6-only, which serverless functions cannot reach at all.

Give the app its own least-privilege role rather than the superuser:

```sql
CREATE ROLE sanjeevani_app LOGIN PASSWORD '…' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO sanjeevani_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sanjeevani_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanjeevani_app;
```

Migrations are applied separately, by an operator, not by the build. A build that can
change the schema is a build that can change it by accident.

**If the database is a Supabase project**, also revoke the REST roles. Supabase grants
`anon` and `authenticated` access to `public` by default and exposes them through
PostgREST — which would put encrypted conversation rows one anon key away:

```sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```

### Deploying

```bash
./scripts/deploy-vercel.sh <vercel-token>
```

That is the whole thing. Create the token at
<https://vercel.com/account/settings/tokens>, scoped to the team, and revoke it
afterwards. On Windows, run it from Git Bash or WSL — or do the five steps by hand:

```bash
export VERCEL_ORG_ID=team_…

# 1. API first.
VERCEL_PROJECT_ID=prj_…api npx vercel deploy --prod --yes --token="$TOKEN"

# 2. Point the web project at the API URL that printed.
#    vercel env add API_INTERNAL_URL production   (paste https://<api-url>)

# 3. Web app.
VERCEL_PROJECT_ID=prj_…web npx vercel deploy --prod --yes --token="$TOKEN"

# 4. Add the web URL to the API's CORS allow-list as APP_ORIGIN.
# 5. Redeploy the API so it reads it.
```

The order is not arbitrary. Next.js evaluates `rewrites()` at build time, so
`API_INTERNAL_URL` has to be correct **before** the web build, not after it. Get
this wrong and the deployment succeeds, looks fine, and proxies to `localhost`.

Neither the script nor the build runs migrations — see **Database** above.

`.vercelignore` keeps `.env` and the local `.vercel/output` out of the upload. The second
matters more than it looks: a stale `.vercel/output` in an upload is treated as a
finished build, and the platform would deploy it instead of building the code you just
changed.

### Honest limits of this target

- **Rate limiting is per-instance.** `express-rate-limit` counts in memory, and there are
  many instances. The configured ceiling is therefore a floor, not a cap. For a real
  ceiling the counter has to move to a shared store.
- **Cold starts.** The first request to an idle instance pays for the container boot,
  including the first database connection. Triage itself is unaffected — it is
  deterministic TypeScript — but the first request after a quiet period is slower.
- **Request body cap.** Uploaded audio is limited by the platform's body size, which is
  smaller than what a long recording can reach. The browser's own speech recognition is
  the fallback and needs no upload at all.
- **Retention runs daily, not hourly.** A conversation can outlive its `expiresAt` by up
  to a day. That is a real, if small, weakening of the retention promise, and it is the
  price of having no process to keep a timer in.

## Docker (optional)

Not required for anything above. If you do use containers:

```bash
docker compose up --build
```

`docker-compose.yml` brings up PostgreSQL, the API and the web server, with health checks
and an ordered start. For a real deployment, supply the secrets from your platform's
secret store rather than `.env`, and put a TLS terminator in front of the web service.

Both images are multi-stage: dependencies and build in the first stage, a slim runtime in
the second, running as a non-root user.

---

## Health and observability

- `GET /health` — liveness, touches nothing. Use for container health checks.
- `GET /health/ready` — readiness, checks the store. Use as a load-balancer gate.
- `GET /v1/capabilities` — which providers are actually live. Check this after a deploy;
  it is the fastest way to notice a key that did not make it into the environment.

Logs are structured JSON (pino) with a request id on every line. The logger redacts
`authorization`, `cookie`, `set-cookie` and every configured secret, and message text is
never logged — only its length and language.

## Production checklist

- [ ] `NODE_ENV=production`, `DEMO_MODE=false`
- [ ] `JWT_SECRET` and `DATA_ENCRYPTION_KEY` set from a secret store, not a file
- [ ] `DATABASE_URL` points at a database with TLS and automated backups
- [ ] `APP_ORIGIN` lists exactly your public origins
- [ ] `TRUST_PROXY` matches your actual proxy depth
- [ ] Migrations applied; `npm run db:purge` scheduled
- [ ] `npm run check:secrets` green in CI
- [ ] Google key restricted to Places (New) + Routes and to server IPs
- [ ] Map tile usage within the provider's policy
- [ ] `GET /v1/capabilities` shows the providers you expect
- [ ] Emergency contacts in `packages/config/src/emergency.ts` re-verified against their
      source URLs before launch, and on a schedule after it
