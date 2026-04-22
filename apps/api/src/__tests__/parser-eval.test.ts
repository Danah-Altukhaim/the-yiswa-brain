/**
 * Parser eval harness. Runs a golden set of utterances against parseUtterance() and
 * asserts the emitted action + module. Skipped in CI unless ANTHROPIC_API_KEY is set.
 *
 * Run: ANTHROPIC_API_KEY=... pnpm --filter @brain/api test parser-eval
 */
import { describe, it, expect } from "vitest";
import { parseUtterance } from "@brain/prompts";
import type { FieldDefinition } from "@brain/shared";

const modules: Array<{ slug: string; label: string; fields: FieldDefinition[] }> = [
  {
    slug: "branches",
    label: "Branches",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, localized: true },
      { key: "status", label: "Status", type: "select", required: true, localized: false,
        options: ["Active", "CLOSED", "Temp Closed"] },
      { key: "hours_regular", label: "Hours", type: "textarea", required: true, localized: false },
    ],
  },
  {
    slug: "promotions",
    label: "Promotions",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, localized: false },
      { key: "type", label: "Type", type: "select", required: true, localized: false,
        options: ["Promo", "Bank", "Seasonal"] },
      { key: "message", label: "Message", type: "textarea", required: true, localized: true },
    ],
  },
];

const GOLDEN: Array<{ utterance: string; action: string; module: string }> = [
  { utterance: "Add a promo: 30% off rides in July", action: "CREATE", module: "promotions" },
  { utterance: "Close all branches for Eid June 15-17", action: "BULK_UPDATE", module: "branches" },
  { utterance: "Remove the NBK promotion", action: "DELETE", module: "promotions" },
  { utterance: "Make one like the NBK promo but for KFH, 20%", action: "DUPLICATE", module: "promotions" },
  { utterance: "What promos are active?", action: "QUERY", module: "promotions" },
  { utterance: "Add a Ramadan promo, publish it on March 10", action: "SCHEDULE", module: "promotions" },
  { utterance: "Change Salmiya hours to 9AM-1AM", action: "UPDATE", module: "branches" },
];

const itOrSkip = process.env.ANTHROPIC_API_KEY ? it : it.skip;

describe("parser golden set", () => {
  for (const g of GOLDEN) {
    itOrSkip(`${g.action}: "${g.utterance}"`, async () => {
      const r = await parseUtterance({
        utterance: g.utterance,
        tenantId: "eval",
        modules,
        recentEntriesByModule: {
          promotions: [{ id: "p1", name: "NBK Summer Promo", data: { name: "NBK Summer Promo" } }],
          branches: [{ id: "b1", name: "Salmiya", data: { name_en: "Salmiya" } }],
        },
        sessionHistory: [],
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.action.action).toBe(g.action);
        if ("module" in r.action && r.action.module) {
          expect(r.action.module).toBe(g.module);
        }
      }
    }, 30_000);
  }
});
