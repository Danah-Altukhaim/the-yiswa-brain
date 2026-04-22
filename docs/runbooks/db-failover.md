# Runbook: Postgres (Neon) degraded or down

## Signals

- `/health` returns `{"status":"degraded", "db": false}`.
- Sentry errors tagged with `PrismaClientInitializationError` or `ECONNREFUSED`.
- Neon console shows the compute endpoint as "suspended" or "unhealthy".

## Diagnose

1. **Is it us or is it Neon?**
   - Neon status page: https://neonstatus.com
   - If Neon is healthy, check our compute endpoint in the console (scaling state, recent events).
2. **Check connection counts.** Prisma pools default to (`num_cpus * 2 + 1`) connections per instance. Serverless concurrency on Vercel can exhaust the pool. Look at `pg_stat_activity` from the Neon SQL editor:
   ```sql
   SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
   ```
3. **Check migrations.** A failed migration leaves the DB in an inconsistent state. Check `_prisma_migrations`:
   ```sql
   SELECT migration_name, started_at, finished_at, rolled_back_at
   FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
   ```

## Mitigate

### Compute suspended (Neon free/scale-to-zero)

Cold start should recover within ~5s. No action beyond waiting.

### Connection exhaustion

- In the short term: throttle traffic (temporarily drop global rate limit in `server.ts` from 200/min to 50/min) and redeploy.
- In the medium term: enable Neon Pooler (PgBouncer). Update `DATABASE_URL` to the pooler URL; keep `DATABASE_MIGRATE_URL` on the direct URL (migrations need session-mode).

### Primary compute endpoint unhealthy

1. In Neon console, create a new compute endpoint from the same branch.
2. Update `DATABASE_URL` in Vercel env to the new endpoint string.
3. Redeploy (`vercel --prod`).
4. Leave the old endpoint in place until new one is observed stable for 15 minutes, then delete.

### Data corruption / bad migration

1. Neon supports point-in-time restore via branches. Create a branch from "5 minutes before the incident".
2. Promote: update `DATABASE_URL` to the new branch's endpoint. Redeploy.
3. Investigate in the original branch (it is preserved; never delete during an incident).

## Verify

- `/health` returns `status: "ok"`, `db: true`.
- RLS test passes against the new DB: `pnpm test rls-leak.test.ts`.
- No Sentry errors tagged `PrismaClient*` in the last 15 minutes.
- End-to-end login from a real user account works.

## Rollback

If the failover endpoint is worse than the original, revert `DATABASE_URL` in Vercel env and redeploy. Neon branches are cheap to keep around — do not delete either branch during the incident.
