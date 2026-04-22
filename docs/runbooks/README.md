# Runbooks

One per incident class. Linked from PagerDuty alerts.

- `cron-failure.md`: missed scheduled publish / expiry, backfill procedure.
- `claude-outage.md`: parser/translation/gap-scan degradation, form fallback, status banner.
- `whatsapp-ratelimit.md`: batch backoff, DLQ, template re-submission.
- `r2-outage.md`: media uploads disabled banner, retry queue.

Each runbook follows the template: Symptoms → Triage → Mitigation → Root-cause fix → Postmortem link.
