/** Pinned model IDs per task. Override centrally if upgraded. */
export const MODELS = {
  parser: "claude-sonnet-4-5",
  duplicate: "claude-sonnet-4-5",
  translate: "claude-haiku-4-5-20251001",
  gapScan: "claude-opus-4-5",
  testIt: "claude-opus-4-5",
} as const;

export type ModelTask = keyof typeof MODELS;
