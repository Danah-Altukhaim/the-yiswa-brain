# The Brain

Multi-tenant, AI-native knowledge hub for PAIR AI.

```
┌─────────────┐        ┌──────────────────────────────┐        ┌────────────────┐
│  React SPA  │◄──────►│  Fastify API (@brain/api)    │◄──────►│  Postgres (RLS)│
│  apps/web   │  JWT   │  + JWT, api-key, rate limit  │        │  + pg_trgm     │
│  (Vite)     │        │  + Zod validation            │        └────────────────┘
└─────────────┘        │  + Prisma ORM                │                 │
                       │  + pino logs, Sentry         │        ┌────────▼────────┐
                       │  + prom-client /metrics      │        │   Redis (cache, │
                       └──────────┬───────────────────┘        │    session mem) │
                                  │                            └─────────────────┘
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
             ┌───────────┐ ┌───────────┐ ┌────────────┐
             │  Claude   │ │  OpenAI   │ │  R2 (S3)   │
             │  (prompt) │ │  (whisper,│ │  media     │
             │           │ │   translate)│           │
             └───────────┘ └───────────┘ └────────────┘
```

## Layout

```
apps/
  api/              Fastify server, services, plugins, routes
  web/              React SPA (Vite)
packages/
  shared/           Zod schemas + types shared across api/web
  prompts/          Claude prompt code (parser, translate, gap-scan, test-it)
infra/
  migrations/       Hand-authored SQL (RLS policies + schema fragments)
  seed/             Dev fixtures (`pnpm seed`)
  cron/             Scheduled jobs (publish, expiry, gap-scan, PDF)
docs/
  adr/              Architecture decision records
  runbooks/         Incident response (auth, RLS, DB failover, LLM outage)
scripts/            Operational scripts + CI helpers
```

## Quick start

Prereqs: Node 20.11+, pnpm 9, Docker.

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm migrate
pnpm seed
pnpm dev
```

The API listens on `:3000`, the web app on `:5173`. In non-production, Swagger UI is at **http://localhost:3000/docs**.

For a one-liner demo see `./demo.sh`.

## Configuration

All runtime config comes from environment variables. The canonical list is in `apps/api/src/lib/env.ts` and documented in `.env.example`. CI enforces parity via `scripts/check-env-example.sh` — if you add a key to `env.ts`, add it to `.env.example` in the same PR.

Notable vars:

| Var                    | Required                  | Notes                                                    |
| ---------------------- | ------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`         | yes                       | App runtime role. No `BYPASSRLS`.                        |
| `DATABASE_MIGRATE_URL` | yes in CI/prod            | Migrate role with `BYPASSRLS`. Only used for migrations. |
| `JWT_ACCESS_SECRET`    | yes                       | Min 16 chars. Rotate via the auth-incident runbook.      |
| `JWT_REFRESH_SECRET`   | yes                       | Same.                                                    |
| `CORS_ORIGIN`          | yes                       | Comma-separated allowlist.                               |
| `ANTHROPIC_API_KEY`    | yes for LLM routes        | Primary LLM; see ADR 0005.                               |
| `OPENAI_API_KEY`       | yes for voice + translate |                                                          |
| `SENTRY_DSN`           | no                        | Error capture is a no-op if unset.                       |
| `REQUEST_TIMEOUT_MS`   | no (default 60_000)       | Per-request hard deadline.                               |

## Testing

```bash
pnpm test                                # all workspaces
pnpm --filter @brain/api test:coverage   # with coverage gate
pnpm --filter @brain/api test rls-leak   # single file
```

Coverage thresholds are set in `apps/api/vitest.config.ts` and enforced by CI. They ratchet up — never lower them without a team decision.

## Deployment

Two supported targets (see ADR 0003):

- **Vercel serverless**: push to `main`, Vercel picks it up via `vercel.json`. API becomes edge functions; web is the static SPA.
- **Docker**: `docker build .` produces a multi-stage image that runs as non-root, with an HTTP `HEALTHCHECK` and tini as PID 1.

Long-running work (cron, PDF gen) only runs on the Docker target — the 30s serverless budget is not enough.

## Operations

Runbooks live in `docs/runbooks/`:

- `auth-incident.md`
- `rls-leak.md`
- `db-failover.md`
- `llm-outage.md`

`/metrics` exposes Prometheus metrics (api-key gated, scope `read:metrics`): `http_request_duration_ms`, `llm_call_total`, `auth_login_total`, plus Node defaults.

`/health` returns a JSON blob with `{status, db, redis}`. It is used by the Dockerfile HEALTHCHECK and by uptime monitors.

## Security

See `SECURITY.md` for how to report issues. The short version: no public issues, email security@pair.ai.

Key defenses in code:

- Postgres RLS for tenant isolation (ADR 0001)
- @fastify/helmet (CSP, HSTS, frame-ancestors)
- bcrypt + dummy-hash constant-time compare on login
- Per-route rate limits; login capped at 5 attempts per 5 minutes
- Gitleaks secret scan on every push
- `pnpm audit --audit-level=high --prod` on every push

## Contributing

See `CONTRIBUTING.md`. TL;DR: one change per PR, green CI before review, use `req.log` not `console.log`, every env var goes in `.env.example`.

## Delivery notes

`FINALIZE.md` is the end-of-build report (feature-by-PRD coverage, kill-switches, go-live checklist).
