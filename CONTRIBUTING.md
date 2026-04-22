# Contributing to The Brain

This is an internal repo. The notes below keep PRs from getting stuck in review.

## Dev setup

Prerequisites: Node 20.11+, pnpm 9, Docker (for local Postgres + Redis).

```
git clone <repo>
cd the-brain
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm migrate
pnpm seed
pnpm dev
```

The API comes up on `:3000`, the web app on `:5173`. Swagger UI (dev only) is at `/docs`.

## Workflow

- One change per PR. If you find yourself rewriting the plan while implementing, open a new PR rather than expanding the current one.
- Branch naming: `<type>/<short-slug>` where type is one of `feat`, `fix`, `chore`, `security`, `refactor`, `docs`.
- Write the commit message in the imperative ("Add retry helper" not "Added" or "Adds"). Explain _why_ in the body, not _what_ — the diff shows what.
- Open the PR against `main`. CI must be green before review.
- The pre-commit hook runs `lint-staged` (eslint + prettier). Do not skip it.

## Coding conventions

- TypeScript strict mode, no `any` without a one-line comment explaining why.
- Zod validation at every HTTP boundary. Schemas live in `packages/shared` when reused, in-route otherwise.
- Structured logging via `req.log.info/warn/error`. No `console.log` in production paths.
- Errors either throw an `AppError` subclass (handled by `plugins/error-handler.ts`) or let Zod throw naturally. Never swallow errors silently.
- No new external SDK call without an explicit timeout. If the call is idempotent, wrap with `withRetry` from `apps/api/src/lib/retry.ts`.
- Every new env variable needs an entry in `.env.example`. CI enforces parity via `scripts/check-env-example.sh`.

## Testing

- Unit / integration tests live alongside the file they test as `*.test.ts` under `apps/api/src/__tests__/`.
- Cross-tenant isolation: any new table with a `tenantId` column needs an entry in the RLS leak test.
- Coverage gates are enforced in CI (`vitest --coverage`). The threshold ratchets up over time; do not lower it without a team decision.

## Running specific checks locally

```
pnpm lint                   # eslint
pnpm typecheck              # tsc --noEmit across workspaces
pnpm test                   # vitest
pnpm --filter @brain/api test:coverage
pnpm --filter @brain/api test rls-leak     # one file
bash scripts/scan-secrets.sh               # gitleaks (requires `brew install gitleaks`)
```

## Reviewing

- Security-sensitive files (see `.github/CODEOWNERS`) need a second reviewer from the security group.
- Every PR comes with a filled-out risk checklist (see `.github/pull_request_template.md`).
- Migrations require either a backwards-compatible rollout plan or a migration window documented in the PR body.

## Where things live

```
apps/api          Fastify API (the main surface)
apps/web          React SPA (Vite)
packages/shared   Zod schemas and TS types
packages/prompts  Claude prompt code
infra/migrations  SQL migrations (hand-authored)
infra/cron        Scheduled jobs
docs/adr          Architecture decision records
docs/runbooks     Incident response guides
scripts           Operational scripts (imports, audits)
```
