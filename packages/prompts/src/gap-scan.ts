import { z } from "zod";
import {
  getClaude,
  extractMetrics,
  recordClaudeCall,
  type ClaudeCallMetrics,
} from "./claude-client.js";
import { MODELS } from "./models.js";

export const GapSuggestion = z.object({
  type: z.enum(["missing", "stale", "translation_gap", "consistency", "low_served"]),
  module_slug: z.string().optional(),
  description: z.string(),
});
export type GapSuggestion = z.infer<typeof GapSuggestion>;

const GapResult = z.object({ suggestions: z.array(GapSuggestion) });

export async function runGapScan(args: {
  tenantName: string;
  kbSummary: Array<{
    module: string;
    entries: Array<{ id: string; data: unknown; updated_at: string }>;
  }>;
  analytics: Array<{ entry_id: string; served_count: number }>;
}): Promise<{ suggestions: GapSuggestion[]; metrics: ClaudeCallMetrics }> {
  const startedAt = Date.now();
  let resp;
  try {
    resp = await getClaude().messages.create({
      model: MODELS.gapScan,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: 'You audit a tenant\'s knowledge base for: missing content, stale content (>30d unchanged), translation gaps (missing AR/EN), consistency issues (contradictions), and low-served entries (never served in 30d). Return JSON: {"suggestions":[{"type":"...","module_slug":"...","description":"..."}]} with no prose.',
          cache_control: { type: "ephemeral" },
        },
      ] as any,
      messages: [
        {
          role: "user",
          content: `TENANT: ${args.tenantName}\nKB: ${JSON.stringify(args.kbSummary)}\nANALYTICS: ${JSON.stringify(args.analytics)}`,
        },
      ],
    });
  } catch (err) {
    recordClaudeCall(MODELS.gapScan, startedAt, "error");
    throw err;
  }
  recordClaudeCall(MODELS.gapScan, startedAt, "success");
  const metrics = extractMetrics(resp, MODELS.gapScan, startedAt);
  const block = resp.content.find((b) => b.type === "text");
  const raw = block?.type === "text" ? block.text : "{}";
  try {
    const parsed = GapResult.parse(JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw));
    return { suggestions: parsed.suggestions, metrics };
  } catch {
    return { suggestions: [], metrics };
  }
}
