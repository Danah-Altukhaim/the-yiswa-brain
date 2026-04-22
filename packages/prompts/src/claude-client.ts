import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_TIMEOUT_MS = 60_000;

let client: Anthropic | null = null;
export function getClaude(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY missing");
    client = new Anthropic({ apiKey: key, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

export type ClaudeObservation = {
  model: string;
  latencyMs: number;
  status: "success" | "error";
};

// Observer hook. apps/api wires a prom-client counter at startup; other
// consumers of @brain/prompts can ignore it. Set to null (default) means no-op.
type Observer = (obs: ClaudeObservation) => void;
let observer: Observer | null = null;
export function setClaudeObserver(fn: Observer | null): void {
  observer = fn;
}

/** Record one Claude call for metrics. Swallows observer errors so telemetry
 *  can never break a request path. */
export function recordClaudeCall(
  model: string,
  startedAt: number,
  status: "success" | "error",
): void {
  if (!observer) return;
  try {
    observer({ model, latencyMs: Date.now() - startedAt, status });
  } catch {
    /* observer must never throw upstream */
  }
}

export type ClaudeCallMetrics = {
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  stopReason: string | null;
};

export function extractMetrics(
  resp: Anthropic.Message,
  model: string,
  startedAt: number,
): ClaudeCallMetrics {
  const u = resp.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  return {
    model,
    latencyMs: Date.now() - startedAt,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreateTokens: u.cache_creation_input_tokens ?? 0,
    stopReason: resp.stop_reason,
  };
}
