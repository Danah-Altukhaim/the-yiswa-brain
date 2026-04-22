import type { Module } from "../state/modules.js";

// Modules that follow a `<prefix>_*` naming convention can be grouped into
// sub-workspaces inside a single tenant (e.g. Flare Fitness has `flare_*` gym
// modules + `macro_*` meal-prep modules). The toggle only appears when we
// detect at least two distinct prefixes so single-workspace tenants are
// untouched.

const KNOWN_LABELS: Record<string, string> = {
  flare: "Flare Fitness",
  macro: "Macro",
};

export type WorkspaceOption = { slug: string; label: string };

function labelFor(prefix: string): string {
  if (KNOWN_LABELS[prefix]) return KNOWN_LABELS[prefix];
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/_/g, " ");
}

export function prefixOf(slug: string): string | null {
  const i = slug.indexOf("_");
  if (i <= 0) return null;
  return slug.slice(0, i);
}

export function getWorkspaces(modules: Module[]): WorkspaceOption[] {
  // A prefix is only treated as a workspace when at least two modules share it.
  // Prevents false positives like Future Kid's `escalation_rules` / `policy_matrix`
  // (distinct one-off slugs) from hiding the other modules behind a filter.
  const counts = new Map<string, number>();
  for (const m of modules) {
    const p = prefixOf(m.slug);
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const qualifying = Array.from(counts.entries())
    .filter(([, n]) => n >= 2)
    .map(([p]) => p);
  if (qualifying.length < 2) return [];
  return qualifying.sort().map((slug) => ({ slug, label: labelFor(slug) }));
}

export function filterModulesByWorkspace(modules: Module[], workspace: string | null): Module[] {
  if (!workspace) return modules;
  return modules.filter((m) => prefixOf(m.slug) === workspace);
}
