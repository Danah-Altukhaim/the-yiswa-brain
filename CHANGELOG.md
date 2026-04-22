# Changelog

All notable changes to The Brain are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-18

### Added

- `api/v1/[...path].ts`: Vercel catch-all that routes unmatched `/api/v1/*` requests into the hardened Fastify app at `apps/api/src/server.ts`. This exposes the endpoints the new test suites cover (admin, kb, knowledge-base, search, voice, media, translate, analytics/event, kb-health, import) through Vercel without needing per-route stubs.

### Notes

- Demo stubs at `api/v1/health.ts`, `api/v1/auth/*`, `api/v1/chat/*`, `api/v1/entries/*`, `api/v1/me/*`, `api/v1/modules.ts`, `api/v1/modules-with-counts.ts`, and `api/v1/activity.ts` are more specific than the catch-all and continue to serve their paths. Migration from demo to Fastify on a per-path basis is now just a matter of removing the demo stub file.
- Delegation uses `fastify.inject()` rather than streaming the raw HTTP request. Vercel's `@vercel/node` runtime parses the body into `req.body` before the handler runs, which makes stream-based delegation unreliable; `inject()` accepts an already-materialised payload and round-trips cleanly for JSON and small binary bodies. Large multipart uploads are explicitly out of scope on Vercel (4.5 MB body cap) and should use a Docker-hosted Fastify instance.
- Fastify is built once per cold-started serverless instance and cached for warm invocations. `env.superRefine` in `apps/api/src/lib/env.ts` fails boot with a clear Zod error if any required prod secret (`ANTHROPIC_API_KEY`, `SMTP_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `R2_*`) is missing, so misconfiguration is visible on the first request rather than silently no-op.

## [0.1.2] - 2026-04-18

### Fixed

- CI `test:coverage` job broke under v0.1.1 because the `minimatch>=10.2.3` pnpm override replaced the minimatch used by `test-exclude` (a dep of `@vitest/coverage-v8`), which still imports the old default export that was removed in minimatch 10. Removed the minimatch override and added the three minimatch advisories (`CVE-2026-26996`, `CVE-2026-27903`, `CVE-2026-27904`) to `pnpm.auditConfig.ignoreCves` instead. Runtime exposure is limited: minimatch is pulled in through `@vercel/node` which is a build/dev dep; the prod serverless runtime ships Vercel's own. Tracking a proper `@vitest/coverage-v8` bump for a follow-up.

## [0.1.1] - 2026-04-18

### Security

- Upgraded `bcrypt` to 6.0.0 (from 5.1.1) so it pulls in `@mapbox/node-pre-gyp@2`, which eliminates 7 high-severity `tar` transitive advisories (hardlink and symlink path traversal, drive-relative traversal, race condition in path reservations).
- Upgraded `nodemailer` to 7.0.11 (from 6.9.13) to fix the `addressparser` high-severity DoS advisory.
- Added pnpm overrides to force patched transitive versions: `undici>=6.24.0` (2 high WebSocket advisories in the `@vercel/node` dep path), `minimatch>=10.2.3` (3 high ReDoS advisories in the `@vercel/node` dep path), `tar>=7.5.11` (belt-and-suspenders across all remaining code paths).
- Added a pnpm override for `fast-jwt>=6.2.0` which closes both critical advisories in that package (Incomplete fix for CVE-2023-48223, Cache Confusion via `cacheKeyBuilder`). `@fastify/jwt@8` remains compatible with the upgraded `fast-jwt` under test.
- `pnpm.auditConfig.ignoreCves` set for three remaining advisories that cannot be cleanly patched in this release: `CVE-2023-30533` and `CVE-2024-22363` in `xlsx@0.18.5` (SheetJS moved off npm and has no patched release there; replacement is planned for a follow-up), and `CVE-2026-25223` in `fastify@4.29.1` (patch requires Fastify 5.x, a major version bump that cascades to every `@fastify/*` plugin and will be addressed as its own release).
- CI `dependency-audit` job now passes: 0 critical, 0 high (3 ignored with reason).

### Notes

- No functional changes. All 61 API tests + 15 web tests still pass against the upgraded packages. No behavioural difference from 0.1.0.

### Added

- Secret rotation schedule in `SECURITY.md`, covering JWT, API keys, LLM keys, R2, WhatsApp, SMTP, and DB credentials.
- Production-only env validation in `apps/api/src/lib/env.ts` that fails boot if `ANTHROPIC_API_KEY`, `SMTP_URL`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, or `R2_*` are missing when `NODE_ENV=production`. Dev and test keep the silent-stub path.
- Retry with exponential backoff and jitter for WhatsApp sends (5xx and 429 only, 3 attempts). Network errors and timeouts are not retried because sends are not idempotent.
- `whatsapp.test.ts` with coverage for retry-success, retry-rate-limit, fatal-client-error, persistent-failure, and stub paths.
- `entries.test.ts`: 8 integration tests covering CRUD, versioning, and rollback on the FAQ module.
- `kb.test.ts`: 12 integration tests covering API-key auth, scope gating, per-module reads, health, and analytics events.
- `admin.test.ts`: 7 integration tests covering PAIR_ADMIN gating, user create, API key mint (raw returned once, hash stored), marketplace listing, marketplace install, payload validation.
- `cron.test.ts`: 4 integration tests covering publish-cron promotion, `CRON_*_ENABLED=false` short-circuit, expiry flip with audit row, future-dated leave-alone.
- Frontend test runner wired: `escalationRule.test.ts` with 15 cases across importer and prose formats, SLA parsing, round-trip serialisation, and urgency classification. `pnpm --filter @brain/web test` now runs in CI.
- `.github/workflows/release.yml`: tag-triggered release with CHANGELOG-to-release-notes extraction and version-vs-tag consistency check.

### Changed

- `services/whatsapp.ts` reads token and phone id from validated `env` at call time instead of capturing `process.env` at module load. Improves testability and production safety.
- Coverage floor raised from 40 to 60 (lines, functions, statements) and 70 (branches) in `apps/api/vitest.config.ts`. Set just below current actuals so regressions fail CI; intent is to ratchet up each cycle.

### Notes

- Cron runner must be deployed with `DATABASE_URL` pointing to the BYPASSRLS migrate role (or a role that sets `app.is_admin='true'` on every connection). The current cron code queries `scheduled_jobs` and `entries` without first setting `app.tenant_id`, which RLS would block on a plain `app_runtime` connection. Documented in the cron test file header.
- CI `dependency-audit` job reports 2 critical (`fast-jwt` via `@fastify/jwt@8`) and 16 high advisories at release time. None are introduced by this release; all are transitive upstream issues pending ecosystem patches. Tracking for v0.1.1: bump `@fastify/jwt` to a release that pulls in a patched `fast-jwt`, swap `xlsx@0.18.5` for the maintained SheetJS CDN package or an alternative, upgrade `bcrypt` past the old `node-pre-gyp`/`tar` transitive path, bump `@vercel/node` for patched `undici`/`minimatch`, and bump `nodemailer` past the `addressparser` DoS.

### Fixed

- Prose escalation-rule parser (`apps/web/src/lib/escalationRule.ts`) no longer truncates dotted email domains (`finance@pairai.com` now survives round-trip). The regex captured up to the first `.`; the fix runs the match to end-of-cleaned-string with an optional trailing period.
- `POST /api/v1/analytics/event` used the top-level `prisma` client instead of `req.withTenant`, so every insert was blocked by the `content_analytics` RLS policy. Wrapped in `req.withTenant` so the tenant session variable is set before the insert.

## [0.1.0] - 2026-04-18

First tagged cut of The Brain. Code-complete against the 17-week plan documented in `FINALIZE.md`. Structurally production-ready, not yet exercised at customer load. Suitable for a controlled pilot.

### Added

- Multi-tenant Fastify API with Postgres RLS, per-request `app.tenant_id` context, and a CI-gated RLS leak test using two Prisma clients.
- Auth: JWT access and refresh, bcrypt hashing, constant-time dummy-hash compare on unknown users, per-route scope checks, login rate limit.
- Routes: `auth`, `admin`, `modules`, `entries`, `kb`, `chat`, `import`, `activity`, `analytics`, `voice`, `media`, `me`, `translate`.
- AI integration: Claude tiered (Opus / Sonnet / Haiku) via `packages/prompts`, tool-use parser, translator with brand glossary, `test-it`, duplication detection, gap-scan.
- Session memory: last 10 turns in Redis (24h TTL) plus durable summary in `chat_sessions`.
- Modules and marketplace: 9 seed modules, admin install endpoint.
- Scheduled publishing and auto-expiry crons, WhatsApp 3-day warning, daily gap-scan, weekly React-PDF report.
- Versioning: `entry_versions` with 50-retain and rollback endpoint.
- Media: R2 upload and presigned GET with 10MB cap, Whisper voice transcripts.
- Imports: CSV and Excel preview plus commit with `import_logs`.
- Analytics: health score, edit velocity, most-served, never-served, suggestions feed.
- Public REST API: `/knowledge-base` with versioned cache, fallback keyspace, API-key scopes.
- Activity feed with REST and SSE stream; 7-step walkthrough overlay persisted.
- Observability: Pino structured logs, Prometheus `/metrics`, Sentry with PII scrubbing, `/health`, `X-Request-Id` propagation.
- CI: typecheck, lint, audit, gitleaks, vitest with Postgres and Redis services, coverage artifacts, `.env.example` parity check.
- Deployment: multi-stage Dockerfile with non-root and tini, Vercel serverless config, docker-compose for local.
- Ops docs: 9 runbooks (auth-incident, rls-leak, db-failover, llm-outage, cron-failure, r2-outage, whatsapp-ratelimit, claude-outage), 5 ADRs, `SECURITY.md`, `CONTRIBUTING.md`, `FINALIZE.md`.

### Security

- Helmet with HSTS preload, frame-ancestors none, strict CSP.
- Gitleaks on every push.
- `pnpm audit --audit-level=high` blocks CI.
- Parameterised `set_config` for tenant context (no string interpolation).
