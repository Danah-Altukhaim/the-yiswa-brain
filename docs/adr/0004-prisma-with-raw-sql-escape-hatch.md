# ADR 0004: Prisma as primary ORM, raw SQL where Prisma cannot help

Date: 2026-04-18
Status: Accepted

## Context

We needed an ORM that:

- produces correct SQL with strong types,
- supports migrations as checked-in files with version control,
- plays well with Postgres RLS (see ADR 0001),
- does not hide SQL when we need to reach for it (trigram search, RLS set_config, JSONB operators, CTEs).

## Decision

Prisma for modelling, migrations, and 95% of queries. Raw SQL via `$queryRaw` (tagged template) for the remaining 5%.

Where we use raw SQL and why:

- `routes/auth.ts` — `SELECT set_config('app.tenant_id', ...)` to activate RLS. Prisma cannot express session variables.
- `routes/kb.ts` — trigram similarity search (`%` operator, `similarity()`). Prisma has no native pg_trgm support.
- `plugins/tenant-context.ts` — `SET LOCAL app.tenant_id` wrapped in `req.withTenant` so routes never forget.

We explicitly disallow `$queryRawUnsafe` except where the input is a literal SQL fragment (not user input). When user input must reach raw SQL, use `$queryRaw` with tagged-template interpolation so every value becomes a bound parameter.

## Consequences

- Type safety: `$queryRaw<RowShape>` requires us to hand-declare the return row. A mismatch silently returns wrong-shaped rows — mitigated by adding an integration test any time raw SQL touches new columns.
- The `Prisma.sql` tagged template is required when composing conditional fragments. Concatenating with `+` would lose parameterization.
- Migrations are authored as SQL files in `infra/migrations/` when they need Postgres-specific DDL (RLS policies, indexes on JSONB paths). Prisma's generator handles the schema; hand-written SQL handles the rest.
