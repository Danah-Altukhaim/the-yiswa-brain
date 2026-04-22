/**
 * Thin Sentry wrapper. No-op when SENTRY_DSN is unset so dev and tests stay silent.
 * Scrubs auth-bearing headers and known secret-carrying fields before upload.
 */
import * as Sentry from "@sentry/node";

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-api-key", "x-tenant-api-key"]);
const SENSITIVE_KEYS = /pass(word)?|secret|token|api[_-]?key|authorization|cookie/i;

let initialized = false;

export function initSentry(dsn: string | undefined, environment: string): boolean {
  if (initialized || !dsn) return initialized;
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        for (const h of Object.keys(event.request.headers)) {
          if (SENSITIVE_HEADERS.has(h.toLowerCase())) {
            event.request.headers[h] = "[redacted]";
          }
        }
      }
      if (event.extra) {
        for (const [k, v] of Object.entries(event.extra)) {
          if (SENSITIVE_KEYS.test(k)) event.extra[k] = "[redacted]";
          if (typeof v === "string" && v.length > 4000)
            event.extra[k] = v.slice(0, 4000) + "...[truncated]";
        }
      }
      return event;
    },
  });
  initialized = true;
  return true;
}

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  if (!initialized) return;
  Sentry.captureException(err, { extra: context });
}

export function isSentryOn(): boolean {
  return initialized;
}

export { Sentry };
