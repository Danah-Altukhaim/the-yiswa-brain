import OpenAI from "openai";
import { withRetry } from "../lib/retry.js";
import { llmCallTotal, llmCallDurationMs } from "../lib/metrics.js";

const TRANSCRIBE_TIMEOUT_MS = 60_000;
const MODEL = "whisper-1";

let client: OpenAI | null = null;
function getOpenAI() {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY missing");
    client = new OpenAI({ apiKey: key, timeout: TRANSCRIBE_TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

export async function transcribe(
  file: Buffer,
  filename: string,
  language?: "en" | "ar",
  signal?: AbortSignal,
): Promise<string> {
  const openai = getOpenAI();
  const ab = new ArrayBuffer(file.byteLength);
  new Uint8Array(ab).set(file);
  const blob = new File([ab], filename);
  const params: OpenAI.Audio.Transcriptions.TranscriptionCreateParamsNonStreaming = {
    file: blob,
    model: MODEL,
    ...(language ? { language } : {}),
  };
  const startedAt = Date.now();
  try {
    const text = await withRetry(async () => {
      const resp = await openai.audio.transcriptions.create(params, {
        timeout: TRANSCRIBE_TIMEOUT_MS,
        signal,
      });
      return resp.text;
    });
    llmCallTotal.labels("openai", MODEL, "success").inc();
    llmCallDurationMs.labels("openai", MODEL).observe(Date.now() - startedAt);
    return text;
  } catch (err) {
    llmCallTotal.labels("openai", MODEL, "error").inc();
    llmCallDurationMs.labels("openai", MODEL).observe(Date.now() - startedAt);
    const message = err instanceof Error ? err.message : "Unknown transcription error";
    throw new Error(`Transcription failed: ${message}`);
  }
}
