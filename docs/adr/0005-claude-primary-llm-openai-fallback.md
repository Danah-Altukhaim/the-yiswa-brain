# ADR 0005: Claude as primary LLM, OpenAI as fallback

Date: 2026-04-18
Status: Accepted

## Context

The product depends on an LLM for parsing utterances into structured actions, translating bilingual content, and simulating the customer-facing bot in "Test It" mode. Whisper (OpenAI) is used for voice transcription.

We evaluated Anthropic (Claude Opus/Sonnet), OpenAI (GPT-4o family), Google (Gemini), and open-source (Llama-class).

## Decision

- **Primary: Claude**, via `@anthropic-ai/sdk`. Rationale: best quality on the Arabic + English translation task we benchmarked, plus prompt caching materially lowers cost per request on our repeated-system-prompt workload.
- **Fallback and specialist: OpenAI** (`gpt-4o-mini` for translation where cost matters; `whisper-1` for voice transcription — no comparable open alternative at our quality bar).
- **Not used (yet): Gemini, Llama.** Reasonable options, but no evaluated quality advantage and onboarding cost is non-zero.

## Consequences

- `packages/prompts/` centralises all Claude-specific prompt code. Each call site imports from here rather than using the SDK directly. This is the only place to change if we need to swap providers.
- The `ANTHROPIC_API_KEY` is a hard dependency; the service starts without it but Claude-backed endpoints return 503. The `llm-outage.md` runbook documents how to degrade gracefully.
- We pay for two LLM providers. Acceptable: OpenAI usage is small (translate + whisper); Claude is the bulk.
- Retries on LLM calls use `withRetry` (see `apps/api/src/lib/retry.ts`) with jittered backoff — only transient errors retry, never 4xx.
