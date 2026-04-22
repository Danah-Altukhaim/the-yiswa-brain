# Claude API Outage

## Symptoms
- Spike in 5xx from `POST /api/v1/chat/parse` or timeouts >4s.
- `audit_log.action = 'claude.error'` rate climbs.
- Users report preview cards failing to appear.

## Triage
1. Check Anthropic status page.
2. Inspect Sentry for `AnthropicError` groups in the last 15 min.
3. Confirm cache hit rate on parser (Grafana panel `claude_cache_read_ratio`) hasn't collapsed to 0 (indicates a deploy regression vs. upstream outage).

## Mitigation
- Flip per-tenant `chat_enabled = false` for heavy tenants to shed load (form fallback remains available).
- Enable status-banner flag (`BANNER_CHAT_DEGRADED=true`) via Railway env var.
- The parser already retries once on Zod validation failure; no manual retry needed.

## Root-cause fix
- If upstream: wait + monitor.
- If regression: revert deploy; `prisma migrate resolve` is unnecessary (no schema change).

## Postmortem
Track in `/docs/postmortems/YYYY-MM-DD-claude-outage.md`.
