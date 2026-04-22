# ADR 0003: Ship to Vercel and Docker simultaneously

Date: 2026-04-18
Status: Accepted

## Context

The product needs to run in two places:

- **Vercel serverless** for the web frontend and API edge functions under `the-brain-two.vercel.app`.
- **Self-hosted Docker** for on-prem deployments and for customers who require data residency guarantees Vercel cannot offer.

We considered picking one and betting on it, but the enterprise sales motion requires both.

## Decision

Maintain both deployment targets from the same codebase:

- `vercel.json` configures the serverless build. Vercel wraps `apps/api` as edge functions.
- `Dockerfile` builds a production image (`node:20.11.0-alpine`, non-root, tini, HEALTHCHECK).
- `docker-compose.yml` brings up the full stack locally (Postgres, Redis, API, web).
- Environment variables are the only difference between the two targets. Everything is driven by `env.ts`.

## Consequences

- We must not depend on Node APIs that do not work on Vercel Edge Runtime in hot paths. Currently we target Vercel Node functions (not Edge), so this constraint is mild.
- Two CI paths to keep green. The `ci.yml` test job covers both: the build produces artifacts usable by either target.
- Long-running work (cron jobs, PDF generation) must run on the Docker target. Serverless 30s `maxDuration` is too short. Vercel-only deployments skip these features.
- Observability: Sentry and logging must work identically. We use pino (stdout) + Sentry (if DSN present) — both targets emit logs and errors the same way.
