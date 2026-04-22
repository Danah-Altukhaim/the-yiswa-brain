import { z } from "zod";

export const FieldType = z.enum([
  "text",
  "textarea",
  "select",
  "multi_select",
  "date",
  "number",
  "boolean",
  "media",
  "relation",
  "url",
  "hours",
]);

export const HoursEntry = z.object({
  days: z.string().min(1),
  time: z.string().min(1),
});
export type HoursEntry = z.infer<typeof HoursEntry>;
export type FieldType = z.infer<typeof FieldType>;

export const FieldDefinition = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "snake_case key"),
  label: z.string().min(1),
  type: FieldType,
  required: z.boolean().default(false),
  localized: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  relationModuleSlug: z.string().optional(),
  help: z.string().optional(),
});
export type FieldDefinition = z.infer<typeof FieldDefinition>;

export const ModuleSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string(),
  icon: z.string().optional(),
  fields: z.array(FieldDefinition).min(1),
  behaviors: z.record(z.unknown()).default({}),
});
export type ModuleSchema = z.infer<typeof ModuleSchema>;

/** Build a Zod validator for an entry's `data` JSONB given a module's field defs. */
export function buildEntryDataSchema(fields: FieldDefinition[]): z.ZodType {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let base: z.ZodTypeAny;
    switch (f.type) {
      case "text":
      case "textarea":
      case "url":
        base = z.string();
        break;
      case "select":
        base =
          f.options && f.options.length > 0
            ? z.enum(f.options as [string, ...string[]])
            : z.string();
        break;
      case "multi_select":
        // Accept either an array of strings or a legacy newline-joined string so
        // existing textarea data keeps validating during the UI migration.
        base = z.union([z.array(z.string()), z.string()]);
        break;
      case "date":
        base = z.string().datetime();
        break;
      case "number":
        base = z.number();
        break;
      case "boolean":
        base = z.boolean();
        break;
      case "media":
        base = z.string().uuid();
        break;
      case "relation":
        base = z.string().uuid();
        break;
      case "hours":
        base = z.array(HoursEntry);
        break;
    }
    if (f.localized) {
      shape[`${f.key}_en`] = f.required ? base : base.optional();
      shape[`${f.key}_ar`] = f.required ? base : base.optional();
    } else {
      shape[f.key] = f.required ? base : base.optional();
    }
  }
  return z.object(shape).passthrough();
}
