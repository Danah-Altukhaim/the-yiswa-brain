# Runbook: LLM provider outage (Anthropic or OpenAI)

Chat, parser, translate, test-it, and whisper all depend on external LLM providers.
When a provider degrades, we degrade gracefully rather than surfacing hard 500s.

## Signals

- `llm_call_total{status="error"}` > 20% of `llm_call_total` over a 5-minute window.
- Sentry events tagged `Transcription failed` or route `/api/v1/chat/parse`.
- Anthropic status: https://status.anthropic.com
- OpenAI status: https://status.openai.com

## Diagnose

1. **Which provider?** Look at `llm_call_total` broken down by `provider` label. If both are failing, likely DNS or our egress. If one is failing, it is the provider.
2. **Which model?** Some Anthropic models have independent outages. Label `model` shows which.
3. **Is it timeout or error?** The SDK timeouts we set (see `apps/api/src/services/whisper.ts`, `translate.ts`, `packages/prompts/src/claude-client.ts`) are 30-60s. If all calls are timing out, the provider is unreachable. If we see 529/overloaded, the provider is rate-limiting us.

## Mitigate

### Anthropic degraded (primary parser + test-it)

1. **Reduce load.** Drop the chat rate limit in `server.ts` temporarily (e.g. 50/min) and redeploy. This keeps the system responsive while each user gets fewer, slower responses.
2. **Disable non-critical Claude calls.** Set `CRON_GAP_SCAN_ENABLED=false` in Vercel env so the nightly gap-scan job does not pile on.
3. **Fallback to OpenAI.** If the parser has an OpenAI fallback path enabled, verify `OPENAI_API_KEY` is set. If no fallback exists yet, file a post-incident ticket to add one.

### OpenAI degraded (translate + whisper)

1. **Translate queue.** Existing entries already have `_en` and `_ar` so translation is only needed on new writes. Direct users to write in both languages during the outage.
2. **Whisper.** Voice endpoint returns 503 cleanly. Communicate to the user that typed entries still work.

### Both down / our egress broken

1. Check Vercel region status. If regional, fail over to a different region via the Vercel dashboard.
2. If it is us: restart the service (Vercel → redeploy current build).
3. Post a status message at the top of the app via an in-app banner flag.

## Verify

- `llm_call_total{status="error"}` rate drops below 1% over 5 minutes.
- A synthetic call through `/api/v1/chat/parse` succeeds from a staging tenant.
- No new Sentry errors tagged with the affected routes.

## Follow-ups

- Confirm retry-with-backoff configured in `apps/api/src/lib/retry.ts` was used. If we retried aggressively during the outage and made it worse, widen the backoff.
- If no OpenAI fallback existed for a critical Claude path, open an issue to build one.
