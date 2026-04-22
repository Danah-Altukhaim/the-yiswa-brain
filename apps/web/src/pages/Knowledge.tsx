import { useMemo } from "react";
import { Link } from "react-router-dom";
import { filterVisibleModules } from "../lib/modules.js";
import { filterModulesByWorkspace, getWorkspaces } from "../lib/workspace.js";
import { Icon } from "../components/Icon.js";
import { useAuth } from "../state/auth.js";
import { useModules } from "../state/modules.js";
import { useWorkspace } from "../state/workspace.js";

const MODULE_ICON: Record<string, string> = {
  branches: "marker",
  faqs: "question-bubble",
  promotions: "tag",
  policy_matrix: "document",
  partners: "handshake",
  response_templates: "chat",
  escalation_rules: "warning",
  announcements: "notification-bell",
  "booking-flows": "workflow",
  intents: "target",
  documents: "folder",
};

const MODULE_COLOR: Record<string, { bg: string; text: string; ring: string }> = {
  promotions: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
  active_offers: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
  "active-offers": { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
  branches: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  escalation_rules: { bg: "bg-red-50", text: "text-red-500", ring: "ring-red-100" },
  faqs: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
  intents: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
  partners: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
  policy_matrix: { bg: "bg-slate-50", text: "text-slate-600", ring: "ring-slate-100" },
  documents: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-100" },
};

const DEFAULT_COLOR = { bg: "bg-pair-light", text: "text-pair", ring: "ring-pair-light" };

function colorFor(slug: string) {
  return MODULE_COLOR[slug] ?? DEFAULT_COLOR;
}

export function Knowledge() {
  const { modules: allModules, loading } = useModules();
  const user = useAuth((s) => s.user);
  const workspace = useWorkspace((s) => s.workspace);

  const modules = useMemo(() => {
    const visible = filterVisibleModules(allModules);
    // Only filter by workspace when the tenant actually has multiple prefixes.
    if (getWorkspaces(visible).length < 2) return visible;
    return filterModulesByWorkspace(visible, workspace);
  }, [allModules, workspace]);

  const totalEntries = useMemo(() => modules.reduce((sum, m) => sum + m.entryCount, 0), [modules]);

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <div
        className="relative overflow-hidden rounded-apple-lg border border-[#e0e6f0] px-4 py-5 sm:px-7 sm:py-6 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-bg.webp')" }}
      >
        <div className="relative z-10">
          <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] text-apple-text">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-[13px] sm:text-[14px] text-apple-secondary mt-1 max-w-lg">
            Your knowledge base at a glance. Browse modules or review entries.
          </p>
        </div>

        {/* Stats row */}
        {modules.length > 0 && (
          <div className="relative z-10 flex items-center gap-2 sm:gap-3 mt-4 sm:mt-5">
            <div className="rounded-apple-lg bg-white/80 backdrop-blur-md px-4 py-2.5 sm:px-5 sm:py-3 border border-white/90 shadow-apple-sm hover:shadow-apple transition-shadow cursor-default">
              <div className="text-[18px] sm:text-[20px] font-bold text-apple-text leading-tight">
                {modules.length}
              </div>
              <div className="text-[11px] text-apple-secondary mt-0.5">Modules</div>
            </div>
            <div className="rounded-apple-lg bg-white/80 backdrop-blur-md px-4 py-2.5 sm:px-5 sm:py-3 border border-white/90 shadow-apple-sm hover:shadow-apple transition-shadow cursor-default">
              <div className="text-[18px] sm:text-[20px] font-bold text-apple-text leading-tight">
                {totalEntries.toLocaleString()}
              </div>
              <div className="text-[11px] text-apple-secondary mt-0.5">Total entries</div>
            </div>
          </div>
        )}
      </div>

      {/* Module grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card px-5 py-4 animate-pulse">
              <div className="h-4 bg-surface-tertiary/60 rounded w-2/3 mb-2" />
              <div className="h-3 bg-surface-tertiary/40 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-apple-xl bg-surface-tertiary/40 flex items-center justify-center mx-auto mb-4">
            <Icon name="folder" size={24} className="text-apple-tertiary" />
          </div>
          <div className="text-[16px] font-medium text-apple-text">No modules yet</div>
          <div className="text-[13px] text-apple-secondary mt-1.5 max-w-sm mx-auto">
            Create modules from the Admin panel or ask Brain Chat to set things up for you.
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {modules.map((m) => {
            return (
              <Link
                key={m.slug}
                to={`/modules/${m.slug}`}
                className="group flex items-center justify-between rounded-apple-lg border border-apple-separator bg-white px-5 py-4 transition-all duration-200 hover:shadow-apple-md hover:border-pair/30 hover:-translate-y-[1px]"
              >
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-apple-text group-hover:text-pair transition-colors">
                    {m.label}
                  </div>
                  <div className="text-[12px] text-apple-secondary mt-0.5">
                    {`${m.entryCount.toLocaleString()} entr${m.entryCount === 1 ? "y" : "ies"}`}
                  </div>
                </div>
                <Icon
                  name="chevron-right"
                  size={14}
                  className="text-apple-tertiary group-hover:text-pair transition-colors shrink-0 ml-3"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
