/**
 * WhatsApp Business notifications via Meta Graph API.
 *
 * Retry policy: 5xx and 429 are retried with exponential backoff + jitter
 * (3 attempts total). Network errors and timeouts are NOT retried because
 * WhatsApp sends are not idempotent, so a mid-flight failure could produce
 * duplicate messages.
 *
 * Missing token/phoneId is fatal in production (enforced in lib/env.ts) and
 * falls back to a log stub in dev/test so local flows still work.
 */
import { env } from "../lib/env.js";
import { withRetry } from "../lib/retry.js";

type SendArgs = { to: string; template: string; body: string };

class WhatsAppError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "WhatsAppError";
  }
}

function shouldRetryWhatsApp(err: unknown): boolean {
  if (err instanceof WhatsAppError) {
    if (err.status === 429) return true;
    if (err.status >= 500 && err.status < 600) return true;
  }
  return false;
}

export async function sendWhatsApp({ to, template, body }: SendArgs): Promise<void> {
  const token = env.WHATSAPP_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    console.log(`[whatsapp:stub] template=${template} to=${to} body=${body}`);
    return;
  }

  await withRetry(
    async () => {
      const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        throw new WhatsAppError(resp.status, `whatsapp send failed: ${resp.status} ${detail}`);
      }
    },
    { attempts: 3, baseMs: 400, maxMs: 5_000, shouldRetry: shouldRetryWhatsApp },
  );
}
