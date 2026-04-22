const HIDDEN_SLUGS = new Set([
  "announcements",
  "14-announcements",
  "booking-flows",
  "response_templates",
  "response-templates",
  "flare_festival",
]);

const HIDDEN_LABEL_RE =
  /active\s*alerts|announcements|booking\s*flows|response\s*templates|reference\s*documents?|flare\s*festival/i;

export function filterVisibleModules<T extends { slug: string; label: string }>(modules: T[]): T[] {
  return modules.filter((m) => !HIDDEN_SLUGS.has(m.slug) && !HIDDEN_LABEL_RE.test(m.label));
}
