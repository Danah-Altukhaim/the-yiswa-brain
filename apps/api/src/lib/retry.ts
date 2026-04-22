/**
 * Small retry helper for idempotent external calls. No dependency.
 * Retries only on transient failures (5xx, 429, network errors, timeouts).
 * Use ONLY for idempotent operations (GET, PUT-with-fixed-key, search, LLM calls).
 * Never wrap POSTs that create or send anything (payments, emails, webhooks).
 */

export type RetryOptions = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, waitMs: number) => void;
};

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
  return e.status ?? e.statusCode ?? e.response?.status;
}

export function isTransientError(err: unknown): boolean {
  const status = statusOf(err);
  if (typeof status === "number") {
    if (status >= 500 && status <= 599) return true;
    if (status === 408 || status === 425 || status === 429) return true;
    return false;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("econn") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("fetch failed") ||
      msg.includes("aborted")
    ) {
      return true;
    }
  }
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseMs = opts.baseMs ?? 250;
  const maxMs = opts.maxMs ?? 5_000;
  const shouldRetry = opts.shouldRetry ?? isTransientError;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** i);
      const wait = backoff + Math.random() * backoff * 0.25;
      opts.onRetry?.(err, i + 1, wait);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export type TimeoutOptions = { ms: number; signal?: AbortSignal };

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: TimeoutOptions,
): Promise<T> {
  const controller = new AbortController();
  const upstream = opts.signal;
  const onAbort = () => controller.abort(upstream?.reason);
  upstream?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Operation timed out")), opts.ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", onAbort);
  }
}
