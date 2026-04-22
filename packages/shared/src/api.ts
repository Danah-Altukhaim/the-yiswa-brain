import { z } from "zod";

export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  status: z.number(),
});
export type ApiError = z.infer<typeof ApiError>;

export const ApiEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.union([
    z.object({ success: z.literal(true), data, meta: z.record(z.unknown()).optional() }),
    z.object({ success: z.literal(false), error: ApiError }),
  ]);

export const AnalyticsEvent = z.object({
  entry_id: z.string().uuid(),
  module: z.string(),
  event_type: z.enum(["served", "clicked", "fallback"]),
  bot_conversation_id: z.string().optional(),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;
