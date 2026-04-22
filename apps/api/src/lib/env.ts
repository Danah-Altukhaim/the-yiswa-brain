import { z } from "zod";

// `vercel env pull` can append a literal backslash-n to values. Strip that
// plus surrounding whitespace so URL/secret parsing does not silently fail.
function cleanEnv(raw: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    out[k] = v.replace(/\\n$/, "").trim();
  }
  return out;
}

const Env = z
  .object({
    DATABASE_URL: z.string().url(),
    DATABASE_MIGRATE_URL: z.string().url().optional(),
    REDIS_URL: z.string().optional(),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_KID: z.string().default("k1"),
    ANTHROPIC_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    OTEL_ENABLED: z.coerce.boolean().default(false),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    REQUEST_TIMEOUT_MS: z.coerce.number().default(60_000),
    SMTP_URL: z.string().optional(),
    SMTP_FROM: z.string().default("brain@pairai.com"),
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_ID: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().default("brain-media"),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== "production") return;
    const required: Array<keyof typeof v> = [
      "ANTHROPIC_API_KEY",
      "SMTP_URL",
      "WHATSAPP_TOKEN",
      "WHATSAPP_PHONE_ID",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ];
    for (const key of required) {
      if (!v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when NODE_ENV=production`,
        });
      }
    }
  });

export const env = Env.parse(cleanEnv(process.env));
