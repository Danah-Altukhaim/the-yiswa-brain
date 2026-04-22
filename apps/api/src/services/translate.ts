import OpenAI from "openai";
import { withRetry } from "../lib/retry.js";
import { llmCallTotal, llmCallDurationMs } from "../lib/metrics.js";

const TRANSLATE_TIMEOUT_MS = 30_000;
const MODEL = "gpt-4o-mini";

let client: OpenAI | null = null;
function getOpenAI() {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY missing");
    client = new OpenAI({ apiKey: key, timeout: TRANSLATE_TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

const cache = new Map<string, string>();
const MAX_CACHE = 2000;

function cacheKey(text: string, target: "en" | "ar"): string {
  return `${target}::${text}`;
}

export async function translate(text: string, target: "en" | "ar"): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const k = cacheKey(trimmed, target);
  const hit = cache.get(k);
  if (hit) return hit;

  const openai = getOpenAI();
  const targetName = target === "ar" ? "Modern Standard Arabic" : "natural English";
  const startedAt = Date.now();
  let completion;
  try {
    completion = await withRetry(() =>
      openai.chat.completions.create(
        {
          model: MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `You translate short business knowledge-base entries into ${targetName}. Output ONLY the translation, no quotes, no preamble, no notes. Preserve numbers, dates, brand names, and proper nouns. Keep the same line breaks. If the text is already in the target language, return it unchanged.`,
            },
            { role: "user", content: trimmed },
          ],
        },
        { timeout: TRANSLATE_TIMEOUT_MS },
      ),
    );
    llmCallTotal.labels("openai", MODEL, "success").inc();
  } catch (err) {
    llmCallTotal.labels("openai", MODEL, "error").inc();
    llmCallDurationMs.labels("openai", MODEL).observe(Date.now() - startedAt);
    throw err;
  }
  llmCallDurationMs.labels("openai", MODEL).observe(Date.now() - startedAt);
  const out = (completion.choices[0]?.message?.content ?? "").trim();
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(k, out);
  return out;
}
