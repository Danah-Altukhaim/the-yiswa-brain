# Runbook: Row-level security leak suspected

Tenant isolation is enforced by Postgres RLS (`infra/migrations/0001_rls.sql`).
Cross-tenant reads should be impossible through the app role.

## Signals

- `rls-leak.test.ts` fails in CI or locally.
- A tenant reports seeing another tenant's data.
- `rls_violation_total` metric > 0 (should stay at 0).

## Containment (first)

1. **Put the API into read-only mode.** Set `MEDIA_UPLOADS_DISABLED=true` and flip a new `READ_ONLY=true` env var (add one if absent). Deploy. This prevents further writes while you investigate.
2. **Snapshot the DB.** In Neon, create a point-in-time branch from "right now" so the forensic evidence is preserved even if someone keeps mutating.

## Diagnose

1. **Reproduce locally.** Run the failing test against your local Postgres:
   ```
   cd the-brain && pnpm test -- rls-leak.test.ts
   ```
2. **Inspect policies.** Connect as the migrate role and list policies:
   ```sql
   SELECT schemaname, tablename, policyname, roles, qual
   FROM pg_policies
   WHERE schemaname = 'public';
   ```
   Every table holding tenant-scoped data must have a policy that references
   `current_tenant_id()` in `qual`.
3. **Check current_tenant_id().** It reads `current_setting('app.tenant_id', true)`.
   If a route forgot `SELECT set_config('app.tenant_id', $1, true)`, `current_tenant_id()` returns NULL and the policy should reject everything. A leak therefore means either the policy is wrong or a route is running as admin when it should not be.
4. **Grep for RLS bypasses.** `SET LOCAL app.is_admin = 'true'` should only appear in login and api-key pre-auth paths:
   ```
   grep -rn "app.is_admin" apps/api/src/
   ```

## Remediate

- If a policy is missing: add it as a new migration. Never edit an existing migration file.
- If a route forgot `set_config`: wrap the query in `req.withTenant(...)` (defined in `apps/api/src/plugins/tenant-context.ts`).
- If an admin-bypass is being used where it should not be: remove it; if admin access is genuinely needed, route through `/api/v1/admin/*` which has the `authenticateAdmin` preHandler.

## Verify

- `pnpm test rls-leak.test.ts` passes.
- Tenant A client cannot read tenant B rows via any endpoint the complainant used.
- `rls_violation_total` does not increment over a 10-minute window under normal load.

## Postmortem

Required within 48 hours: timeline, root cause, blast radius (rows exposed, tenants affected), customer comms, test added to prevent recurrence.
