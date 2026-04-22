# ADR 0001: Postgres row-level security for multi-tenancy

Date: 2026-04-18
Status: Accepted

## Context

The Brain serves many tenants from one database. We needed a tenancy model that:

- prevents a bug in application code from returning another tenant's rows,
- does not require every query to carry an explicit `WHERE tenant_id = ?` clause,
- works with Prisma (our ORM),
- is auditable by a security reviewer in minutes, not hours.

Candidates we considered:

1. **Database-per-tenant.** Strongest isolation but heavy operationally at our scale (hundreds of tenants expected within a year). Hard to run analytics across tenants.
2. **Schema-per-tenant.** Isolation at the schema level. Runs into Prisma migration pain because migrations must run against each schema. Requires dynamic search_path.
3. **Discriminator column + app-side enforcement.** Simple but brittle: a single missing `WHERE tenant_id = ?` leaks everything.
4. **Postgres row-level security with a session variable.** Database-enforced, policy reviewed once, centrally audited.

## Decision

We use Postgres row-level security. Policies reference a session variable set at the start of every transaction:

```sql
SELECT set_config('app.tenant_id', $1, true);
```

App code runs under the `app_runtime` role which has no `BYPASSRLS`. A separate `app_migrate` role has `BYPASSRLS` and is only used for migrations and the rare pre-auth lookup (login, api-key lookup). See `infra/migrations/0001_rls.sql` for the policies.

The `req.withTenant(tx => ...)` helper in `plugins/tenant-context.ts` wraps the two-line idiom so routes can never accidentally run without it.

## Consequences

- A CI gate (`apps/api/src/__tests__/rls-leak.test.ts`) proves cross-tenant isolation on every PR by running two Prisma clients side by side.
- The login and api-key routes must explicitly `SET LOCAL app.is_admin = 'true'` to perform pre-auth lookups. This is the only bypass path and is grep-able.
- Every table that holds tenant data must have a policy. We cannot forget because a SELECT that should have hit that table will silently return zero rows, which shows up in tests.
