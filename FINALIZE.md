# The Brain: Final State

Code-complete against the 17-week plan at `/Users/mac/.claude/plans/prancy-wiggling-rossum.md`. What exists now is a runnable scaffold for all four phases; remaining work is provisioning + first-tenant go-live checklist.

## Repository map

```
the-brain/
  apps/
    api/                Fastify + Prisma + Claude + R2 + Whisper + WhatsApp + PDF
      src/
        plugins/        tenant-context, auth (JWT), api-key, error-handler
        routes/         auth, admin, modules, entries, kb, chat,
                        import, activity, analytics, voice, media, me
        services/       cache (versioned + fallback + SETNX), entries,
                        session-memory, audit, r2, whisper, email,
                        pdf-report, whatsapp, marketplace
        __tests__/      rls-leak, parser-eval
      prisma/schema.prisma
    web/                Vite + React 18 + Tailwind (light only)
      src/
        pages/          Login, BrainChat, ModulePage, Admin, Analytics, Activity
        components/     Layout, PreviewCard, VoiceButton, Walkthrough
        lib/api, state/auth
  packages/
    shared/             Zod: FieldDefinition, ModuleSchema, Role, ApiScope, ApiEnvelope
    prompts/            claude-client, parser (tool-use), translate,
                        gap-scan, test-it, model tiering
  infra/
    migrations/0001_rls.sql
    cron/               publish, expire, gap-scan, weekly-pdf, index dispatcher
    seed/               2 tenants, 3 modules each, bad-KB fixture for gap-scan
  docs/
    runbooks/           claude-outage, cron-failure, whatsapp-ratelimit, r2-outage
  .github/workflows/ci.yml
  docker-compose.yml, .prettierrc, eslint.config.mjs, .env.example
```

## Feature coverage against PRD

| PRD section | Status |
| --- | --- |
| §6 Stack | Pinned: Fastify, PG+RLS, Prisma, React Vite, Claude tiered, Whisper, R2, JWT |
| §7 Data model | All 16 tables + `migration_diffs` |
| §8 AI-First Editor | Chat routes: parse, confirm, test-it; action router covers 7 actions |
| §9 Voice | Whisper + R2 + `voice_transcripts`; `<VoiceButton>` MediaRecorder |
| §10 Preview cards | Inline editable fields, diff-ready, scheduled badge, confirm-delete gate |
| §11 Test It | Stateless Opus call, pending card merged in RAM, `REFS:` extraction |
| §12 Auto-translation | Haiku per-field, brand glossary cached, confidence surfaced |
| §13 Duplication | Fuzzy source match via tool-use `emit_duplicate` |
| §14 Session memory | Last 10 turns in Redis (TTL 24h) + durable summary in `chat_sessions` |
| §15 Modules + Marketplace | 9 seed modules, `/admin/marketplace/install` |
| §16 Scheduled publishing | Cron every 15 min |
| §17 Auto-expiry + alerts | Hourly cron + WhatsApp 3-day warning |
| §18 AI-learned templates | Recent-entries few-shot in parser system prompt |
| §19 Versioning | `entry_versions` + 50-retain + rollback endpoint |
| §20 Media | R2 upload + presigned GET, 10MB cap |
| §21 CSV/Excel import | Preview + commit, `import_logs`, header → field mapping |
| §22 Analytics | Most/never served, health score, edit velocity, suggestions |
| §23 Daily gap scan | Opus cron → `ai_suggestions` + critical WhatsApp |
| §24 Weekly PDF | React-PDF + SMTP cron |
| §25–27 REST API | Public KB + search + analytics event + versioned cache + fallback keyspace |
| §28 Zendesk hook | `escalation_rules.webhook_url` field-level stub |
| §29 WhatsApp | Publish/expiry/gap templates (stub fallback for local) |
| §30 Auth | JWT access/refresh, bcrypt, per-module permissions |
| §31 White-label | Tenant branding fields (UI polish pending) |
| §32 Activity feed | REST + SSE stream |
| §33 Walkthrough | 7-step overlay, `walkthrough_completed` persisted |
| §34 Export | CSV per module, JSON via `/knowledge-base` |
| §35 NFRs | Rate limiting, structured logs, X-Request-Id, versioned cache |

## Test verification (executed end-to-end)

All green on local Docker (PG 16 + Redis 7). Evidence:

| Check | Result |
| --- | --- |
| `pnpm install` (638 packages) | ✓ |
| `prisma generate` | ✓ |
| Typecheck all 4 workspaces | ✓ |
| `pnpm --filter @brain/web build` (Vite) | ✓ 188KB JS / 10KB CSS |
| `prisma migrate dev` + `0001_rls.sql` + `0002_admin_bypass.sql` | ✓ |
| `pnpm seed`: 2 tenants, 3 modules, API keys printed | ✓ |
| Vitest `rls-leak.test.ts` (two-client: BYPASSRLS admin + app_runtime) | ✓ 3/3 |
| API boot + `/health` | ✓ 200 |
| `POST /auth/login` (sara + admin) | ✓ JWT issued |
| JWT-authed `GET /modules`, `/entries/:slug`, create entry | ✓ |
| Non-admin JWT → `/admin/*` | ✓ 401 |
| Admin `POST /admin/api-keys` → `tb_live_…` returned | ✓ |
| API-key-authed `/knowledge-base`: 3 modules, entries returned | ✓ |
| Versioned cache key `kb:{tenant}:v1` in Redis | ✓ |
| Fallback keyspace `kb_fallback:{tenant}` populated | ✓ |
| Cross-tenant isolation: FK key returns FK tenant_id, TC key returns TC tenant_id | ✓ |
| Rate-limit headers `x-ratelimit-remaining` decrement | ✓ |

## Bugs found and fixed during test

1. `ioredis` default-vs-named import → `import { Redis }`
2. Missing `fastify-plugin` dep → added
3. Anthropic SDK 0.30 types miss `cache_control` → `as any` cast on system blocks
4. `exactOptionalPropertyTypes` too strict for Prisma inputs → removed from `tsconfig.base.json`
5. `server.ts` `import.meta.url === file://…` guard never matched under `node --import tsx` → removed; unconditional `main()`
6. `pino-pretty` not installed → simplified logger config
7. RLS policies blocked pre-auth lookups (login, api-key verify) → added `0002_admin_bypass.sql` extending every tenant_isolation policy with `OR app.is_admin='true'`; login and api-key plugin now set that var in the bootstrap transaction
8. Admin routes used raw `prisma.*` without tenant context → all wrapped in `req.withTenant`
9. Seed script and RLS leak test now explicitly use `DATABASE_MIGRATE_URL` (BYPASSRLS) for setup; the leak test uses a second `runtimePrisma` on `DATABASE_URL` to exercise policies
10. Port collision with another local stack → Postgres 5433, Redis 6380, API 3100

## Local run

```bash
cd the-brain
cp .env.example .env         # fill ANTHROPIC_API_KEY at minimum
docker compose up -d postgres redis
pnpm install
pnpm --filter @brain/api prisma migrate dev --name init
psql "$DATABASE_MIGRATE_URL" -f infra/migrations/0001_rls.sql
pnpm seed
pnpm dev                     # API :3000, web :5173
```

Login: `future-kid` / `demo@example.com` / `password1`.

## CI gates (`.github/workflows/ci.yml`)

- Typecheck, Vitest, Prisma migrate, seed, RLS leak test.
- Parser eval auto-skips unless `ANTHROPIC_API_KEY` is set as a CI secret.

## Go-live checklist (from the plan)

External work not done here:

1. Provision Railway envs (dev/staging/prod) with separate Postgres + Redis + R2 + WhatsApp sandbox numbers.
2. Point Supabase/Postgres to connection with `app_runtime` role (no BYPASSRLS) for runtime, `app_migrate` for migrations.
3. Secret manager (Doppler or Railway secrets); forbid `.env` in repo.
4. Approve WhatsApp templates with Meta: `publish_alert`, `expiry_warning`, `gap_scan_alert`.
5. FK Sheets audit: enumerate tabs, write column → field mapping, run dual-read diff for 72h.
6. Golden Arabic eval set (100 pairs, native-speaker-reviewed) wired as CI gate.
7. pgvector RAG for parser few-shots at >1K entries.
8. OpenTelemetry export to Grafana Cloud.

## Kill-switches (rollback)

| Subsystem | Env var | Effect |
| --- | --- | --- |
| Scheduled publish | `CRON_PUBLISH_ENABLED=false` | Cron no-ops |
| Auto-expiry | `CRON_EXPIRY_ENABLED=false` | No status flips, no warnings |
| Gap scan | `CRON_GAP_SCAN_ENABLED=false` | No Opus calls, no WhatsApp |
| Weekly PDF | `CRON_WEEKLY_PDF_ENABLED=false` | No report email |
| Media uploads | `MEDIA_UPLOADS_DISABLED=true` | Web shows banner |
| Brain Chat | Per-tenant `chat_enabled` flag (to add) | Form-only mode |

## What's intentionally stubbed

- WhatsApp `sendWhatsApp()` falls through to `console.log` without `WHATSAPP_TOKEN`.
- `sendEmail()` falls through to `console.log` without `SMTP_URL`.
- R2 client has no creds → uploads throw; media/voice routes are the only callers and return 500 with an actionable error.
