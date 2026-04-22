import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../state/auth.js";
import { useModules, type Module } from "../state/modules.js";
import { useWorkspace } from "../state/workspace.js";
import { getWorkspaces, prefixOf } from "../lib/workspace.js";
import { Walkthrough } from "./Walkthrough.js";
import { Icon } from "./Icon.js";
import { CommandPalette } from "./CommandPalette.js";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

function routeTitle(pathname: string, modules: Module[], fallback: string): string {
  if (pathname === "/") return "Knowledge Base";
  if (pathname.startsWith("/chat")) return "Brain Chat";
  if (pathname.startsWith("/activity")) return "Activity";
  if (pathname.startsWith("/admin")) return "Admin";
  const m = pathname.match(/^\/modules\/([^/]+)/);
  if (m && m[1]) {
    const mod = modules.find((x) => x.slug === m[1]);
    return mod?.label ?? m[1];
  }
  return fallback;
}

function initials(name?: string | null): string {
  if (!name) return "·";
  return name.charAt(0).toUpperCase();
}

function WorkspaceBrand({
  brandName,
  workspaces,
  workspace,
  setWorkspace,
  activeLabel,
}: {
  brandName: string;
  workspaces: Array<{ slug: string; label: string }>;
  workspace: string | null;
  setWorkspace: (slug: string | null) => void;
  activeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const multi = workspaces.length > 1;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!multi) {
    return (
      <div className="leading-tight min-w-0 flex-1">
        <div className="text-[14px] font-semibold tracking-tight text-apple-text truncate">
          {brandName}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 rounded-apple px-1.5 py-1 hover:bg-black/[0.04] transition-colors"
      >
        <span className="text-[14px] font-semibold tracking-tight text-apple-text truncate">
          {activeLabel}
        </span>
        <Icon name="chevron-down" size={12} className="text-apple-tertiary shrink-0" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 w-full min-w-[180px] rounded-apple bg-white shadow-apple-lg border border-apple-separator py-1 animate-fade-in"
        >
          {workspaces.map((w) => {
            const active = w.slug === workspace;
            return (
              <button
                key={w.slug}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setWorkspace(w.slug);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-left hover:bg-black/[0.04] transition-colors ${
                  active ? "text-apple-text font-medium" : "text-apple-secondary"
                }`}
              >
                <span className="w-3.5 shrink-0 text-pair">
                  {active ? <Icon name="check" size={12} /> : null}
                </span>
                <span className="truncate">{w.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HIDDEN_SLUGS = new Set([
  "announcements",
  "14-announcements",
  "booking-flows",
  "response_templates",
  "response-templates",
]);
const HIDDEN_LABEL_RE = /active\s*alerts|announcements|booking\s*flows|response\s*templates/i;

export function Layout() {
  const { modules: allModules, fetchModules } = useModules();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebarCollapsed") === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMobile = useIsMobile();
  const tenant = useAuth((s) => s.tenant);
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const location = useLocation();

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Global ⌘K / Ctrl+K shortcut opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const modules = useMemo(
    () => allModules.filter((m) => !HIDDEN_SLUGS.has(m.slug) && !HIDDEN_LABEL_RE.test(m.label)),
    [allModules],
  );

  const brandName = tenant?.name ?? "The Brain";
  const workspaces = useMemo(() => getWorkspaces(modules), [modules]);
  const workspace = useWorkspace((s) => s.workspace);
  const setWorkspace = useWorkspace((s) => s.setWorkspace);

  // Default to first workspace when one is available but none selected (or the
  // selected one no longer exists — e.g. after switching tenants).
  useEffect(() => {
    if (workspaces.length === 0) {
      if (workspace !== null) setWorkspace(null);
      return;
    }
    const valid = workspaces.some((w) => w.slug === workspace);
    if (!valid && workspaces[0]) setWorkspace(workspaces[0].slug);
  }, [workspaces, workspace, setWorkspace]);

  // When viewing a module page, auto-sync the workspace to that module's prefix
  // so the sidebar selection matches what the user is looking at.
  useEffect(() => {
    const m = location.pathname.match(/^\/modules\/([^/]+)/);
    const p = m && m[1] ? prefixOf(m[1]) : null;
    if (p && workspaces.some((w) => w.slug === p) && workspace !== p) {
      setWorkspace(p);
    }
  }, [location.pathname, workspaces, workspace, setWorkspace]);

  const activeWorkspaceLabel = useMemo(() => {
    const hit = workspaces.find((w) => w.slug === workspace);
    return hit?.label ?? brandName;
  }, [workspaces, workspace, brandName]);

  const title = useMemo(
    () => routeTitle(location.pathname, modules, activeWorkspaceLabel),
    [location.pathname, modules, activeWorkspaceLabel],
  );

  const workspaceLinks: Array<{ to: string; label: string; icon: string; end?: boolean }> = [
    { to: "/", label: "Knowledge", icon: "folder", end: true },
    { to: "/activity", label: "Activity", icon: "activity" },
  ];
  if (user?.role === "PAIR_ADMIN") {
    workspaceLinks.push({ to: "/admin", label: "Admin", icon: "shield" });
  }

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  /* ── Sidebar content (shared between desktop and mobile) ── */
  const sidebarContent = (showLabels: boolean) => (
    <>
      {/* Brand */}
      <div
        className={`flex items-center ${showLabels ? "px-5 gap-3" : "px-3 justify-center"} py-4`}
      >
        {!showLabels && !isMobile ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="p-1.5 rounded-apple text-apple-secondary hover:text-apple-text hover:bg-black/[0.05] transition-colors"
          >
            <Icon name="panel-left" size={16} />
          </button>
        ) : (
          <>
            <WorkspaceBrand
              brandName={brandName}
              workspaces={workspaces}
              workspace={workspace}
              setWorkspace={setWorkspace}
              activeLabel={activeWorkspaceLabel}
            />
            {!isMobile && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="shrink-0 inline-flex items-center justify-center rounded-apple p-1.5 text-apple-secondary hover:bg-black/[0.05] transition-colors"
              >
                <Icon name="panel-left" size={16} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {showLabels && <div className="nav-section">Workspace</div>}
        {!showLabels && <div className="h-2" />}
        <div className="space-y-0.5">
          {workspaceLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              title={!showLabels ? l.label : undefined}
              onClick={isMobile ? closeMobile : undefined}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""} ${!showLabels ? "!px-0 justify-center" : ""}`
              }
            >
              <Icon name={l.icon} size={16} />
              {showLabels && <span className="truncate">{l.label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User chip */}
      <div className="border-t border-apple-separator-light p-3">
        <div
          className={`flex items-center ${!showLabels ? "flex-col gap-2" : "gap-2.5 px-2 py-1.5"}`}
        >
          <div className="w-8 h-8 rounded-full bg-pair-light text-pair flex items-center justify-center text-[12px] font-semibold shrink-0">
            {initials(user?.name)}
          </div>
          {showLabels && (
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[13px] font-medium text-apple-text truncate">
                {user?.name ?? "-"}
              </div>
              <div className="text-[11px] text-apple-secondary truncate">
                {user?.role?.replace(/_/g, " ").toLowerCase()}
              </div>
            </div>
          )}
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="btn-ghost !px-2 !py-1.5"
            title="Sign out"
          >
            <Icon name="log-out" size={15} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`w-full max-w-full bg-[#FBFBFD] ${isMobile ? "min-h-screen" : "h-screen grid transition-[grid-template-columns] duration-200 ease-out"}`}
      style={
        isMobile ? undefined : { gridTemplateColumns: `${collapsed ? 72 : 260}px minmax(0, 1fr)` }
      }
    >
      {/* ── Desktop sidebar ── */}
      {!isMobile && (
        <aside className="min-h-0 flex flex-col bg-white border-r border-apple-separator overflow-hidden">
          {sidebarContent(!collapsed)}
        </aside>
      )}

      {/* ── Mobile drawer overlay ── */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-fade-in"
            onClick={closeMobile}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <aside className="relative z-50 w-[min(280px,85vw)] h-full flex flex-col bg-white shadow-apple-xl animate-slide-from-left">
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex flex-col min-w-0 min-h-screen md:min-h-0">
        <header className="glass-bar sticky top-0 z-10 h-14 flex items-center px-3 sm:px-6 gap-2 sm:gap-3">
          {/* Mobile hamburger */}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center justify-center rounded-apple p-2 text-apple-text hover:bg-black/[0.05] transition-colors"
              aria-label="Open menu"
            >
              <Icon name="menu" size={20} />
            </button>
          )}

          {location.pathname.startsWith("/modules/") ? (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-apple-secondary hover:text-apple-text transition-colors"
            >
              <Icon name="arrow-left" size={16} />
              <span className="text-[13px] font-medium">Knowledge</span>
            </Link>
          ) : (
            <h1 className="text-[17px] font-semibold tracking-tight text-apple-text truncate">
              {title}
            </h1>
          )}
          <div className="flex-1" />

          {/* Command palette trigger (hidden on module pages) */}
          {!location.pathname.startsWith("/modules/") && (
            <div className="flex items-center gap-2 text-apple-secondary">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                title="Search (⌘K)"
                className="hidden sm:inline-flex items-center gap-2 rounded-apple border border-apple-separator bg-[#F9F9F9] hover:bg-white hover:border-pair/40 transition-colors py-1.5 pl-3 pr-2 text-apple-secondary"
              >
                <Icon name="search" size={14} />
                <span className="text-[13px]">Search knowledge...</span>
                <span className="ml-6 inline-flex items-center gap-0.5 rounded border border-apple-separator bg-white px-1.5 py-0.5 text-[10px] font-mono text-apple-tertiary">
                  <span>⌘</span>
                  <span>K</span>
                </span>
              </button>
              {/* Mobile trigger */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="sm:hidden inline-flex items-center justify-center rounded-apple p-2 text-apple-secondary hover:bg-black/[0.05] transition-colors"
                aria-label="Open command palette"
                title="Search"
              >
                <Icon name="search" size={18} />
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0">
          <div className="p-4 sm:p-6 lg:p-8 animate-fade-in min-w-0">
            <Suspense
              fallback={
                <div className="space-y-4">
                  <div className="h-32 bg-surface-tertiary/40 rounded-apple-lg animate-pulse" />
                  <div className="h-48 bg-surface-tertiary/30 rounded-apple-lg animate-pulse" />
                </div>
              }
            >
              <Outlet context={{ title }} />
            </Suspense>
          </div>
        </div>
      </main>
      <Walkthrough />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} modules={modules} />
    </div>
  );
}
