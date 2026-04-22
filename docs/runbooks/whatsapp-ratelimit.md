# WhatsApp Rate-Limit / Send Failure

## Symptoms
- 429 responses from Meta Graph API.
- Users stop receiving publish / expiry alerts.
- `audit_log.action='whatsapp.error'` rate climbs.

## Triage
1. Check Meta Business Suite → rate-limit tier.
2. Grep logs for `whatsapp send failed: 429`.
3. Confirm template is approved (new templates take 24h).

## Mitigation
- Enable batching: combine per-tenant alerts into a single daily digest when the per-minute budget is exceeded.
- Pause `gap-scan` critical alerts temporarily (`CRON_GAP_SCAN_ENABLED=false`); they're the highest-volume non-critical sender.
- Failed messages land in `audit_log`; replay with a one-off script once headroom returns.

## Root-cause fix
- Request higher tier from Meta.
- Respect the 24h customer-window rule for non-template messages.
