# Cron Failure

## Symptoms
- Scheduled entry didn't publish after its slot.
- Expired entries still appear in `/api/v1/knowledge-base`.
- Daily gap-scan row count in `ai_suggestions` is zero for a day.

## Triage
1. Railway → Crons: inspect last exit code + logs for `publish` / `expire` / `gap-scan` / `weekly-pdf`.
2. Check `scheduled_jobs` for `status='pending'` rows older than their `scheduled_at`.
3. Confirm the kill-switch env vars are NOT set to `false`: `CRON_PUBLISH_ENABLED`, `CRON_EXPIRY_ENABLED`, `CRON_GAP_SCAN_ENABLED`, `CRON_WEEKLY_PDF_ENABLED`.

## Mitigation
- Manual trigger: `CRON_JOB=publish node infra/cron/index.js` (or staging shell).
- Backfill window: cron is idempotent, safe to re-run up to 24h behind.
- If many tenants affected: run one tenant at a time and watch logs.

## Root-cause fix
- Claude rate-limit → add retry+jitter in the specific cron.
- Prisma migration drift → redeploy with migration before re-running.
