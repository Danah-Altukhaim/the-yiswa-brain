import {
  getClaude,
  extractMetrics,
  recordClaudeCall,
  type ClaudeCallMetrics,
} from "./claude-client.js";
import { MODELS } from "./models.js";

export type TestItResult = {
  botResponse: string;
  referencedEntryIds: string[];
  metrics: ClaudeCallMetrics;
};

/**
 * Stateless Test It: render a bot response from a KB snapshot that INCLUDES the pending card merged in RAM.
 * No DB writes. No chat session.
 */
export async function simulateBot(args: {
  botSystemPrompt: string;
  kbSnapshot: Record<string, Array<{ id: string; data: unknown }>>;
  userQuestion: string;
  locale: "en" | "ar";
}): Promise<TestItResult> {
  const startedAt = Date.now();
  let resp;
  try {
    resp = await getClaude().messages.create({
      model: MODELS.testIt,
      max_tokens: 1024,
      system: [
        { type: "text", text: args.botSystemPrompt, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: "SIMULATION ONLY. This is a Test It preview, not a live customer. After your response, list referenced entry IDs on a final line: REFS: [id1,id2,...]",
        },
        { type: "text", text: `KB: ${JSON.stringify(args.kbSnapshot)}` },
      ] as any,
      messages: [{ role: "user", content: args.userQuestion }],
    });
  } catch (err) {
    recordClaudeCall(MODELS.testIt, startedAt, "error");
    throw err;
  }
  recordClaudeCall(MODELS.testIt, startedAt, "success");
  const metrics = extractMetrics(resp, MODELS.testIt, startedAt);
  const block = resp.content.find((b) => b.type === "text");
  const raw = block?.type === "text" ? block.text : "";
  const refsMatch = raw.match(/REFS:\s*\[([^\]]*)\]/);
  const refs =
    refsMatch && refsMatch[1]
      ? refsMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/["']/g, ""))
          .filter(Boolean)
      : [];
  const body = raw.replace(/REFS:.*$/s, "").trim();
  return { botResponse: body, referencedEntryIds: refs, metrics };
}
