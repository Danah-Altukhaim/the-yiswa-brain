import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { filterVisibleModules } from "../lib/modules.js";
import { Icon } from "../components/Icon.js";

type Action = "create" | "update" | "delete" | "rollback";

type Event = {
  id: string;
  action: Action;
  timestamp: string;
  user: { id: string; name: string } | null;
  module: { slug: string; label: string } | null;
  entry: { id: string; title: string } | null;
  detail: string | null;
};

type Module = { id: string; slug: string; label: string };

const ACTION_META: Record<Action, { label: string; icon: string; chip: string; verb: string }> = {
  create: { label: "Created", icon: "plus", chip: "badge-green", verb: "added" },
  update: { label: "Updated", icon: "pencil", chip: "badge-blue", verb: "edited" },
  delete: { label: "Deleted", icon: "trash", chip: "badge-red", verb: "deleted" },
  rollback: { label: "Rollback", icon: "reverse", chip: "badge-purple", verb: "rolled back" },
};

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

function relTime(iso: string): string {
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === "second") {
      return RTF.format(Math.round(diff / secs), unit);
    }
  }
  return "just now";
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayBucket(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / (24 * 3600 * 1000));
  const key = d.toISOString().slice(0, 10);
  let label: string;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Yesterday";
  else if (diffDays < 7) label = d.toLocaleDateString(undefined, { weekday: "long" });
  else label = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return { key, label };
}

function initials(name?: string | null): string {
  if (!name) return "·";
  return name.trim()[0]?.toUpperCase() ?? "·";
}

export function Activity() {
  const [events, setEvents] = useState<Event[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleSlug, setModuleSlug] = useState("");
  const [action, setAction] = useState<"" | Action>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Module[]>("/api/v1/modules")
      .then((mods) => setModules(filterVisibleModules(mods)))
      .catch(() => setModules([]));
  }, []);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleSlug, action]);

  async function load(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (moduleSlug) params.set("moduleSlug", moduleSlug);
      if (action) params.set("action", action);
      params.set("limit", "100");
      const data = await api<Event[]>(`/api/v1/activity?${params}`);
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; events: Event[] }>();
    for (const e of events) {
      const b = dayBucket(e.timestamp);
      if (!map.has(b.key)) map.set(b.key, { label: b.label, events: [] });
      map.get(b.key)!.events.push(e);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, v]) => ({ key, label: v.label, events: v.events }));
  }, [events]);

  const filterActive = !!moduleSlug || !!action;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] text-apple-tertiary uppercase tracking-widest">History</p>
          <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-apple-text">Activity</h1>
          <p className="text-[13px] text-apple-secondary mt-0.5">
            Every change to your knowledge base, in order.
          </p>
        </div>
        <button
          onClick={() => load(false)}
          disabled={refreshing}
          className="btn-ghost"
          title="Refresh"
          aria-label="Refresh"
        >
          <Icon name="refresh" size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="filter" size={14} className="text-apple-tertiary mx-1 hidden sm:block" />
          <select
            className="input-apple !py-1.5 !text-[13px] w-full sm:w-56"
            value={moduleSlug}
            onChange={(e) => setModuleSlug(e.target.value)}
          >
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            className="input-apple !py-1.5 !text-[13px] w-full sm:w-44"
            value={action}
            onChange={(e) => setAction(e.target.value as "" | Action)}
          >
            <option value="">Any action</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="rollback">Rollback</option>
            <option value="delete">Deleted</option>
          </select>
          {filterActive && (
            <button
              onClick={() => {
                setModuleSlug("");
                setAction("");
              }}
              className="btn-ghost !py-1.5 !text-[12px] shrink-0"
            >
              Clear
            </button>
          )}
        </div>
        <span className="text-[12px] text-apple-tertiary px-1 text-right sm:text-left">
          {loading ? "Loading..." : `${events.length} event${events.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error && (
        <div className="card p-4 text-[13px] text-apple-red">{error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="card p-10 text-center">
          <Icon name="inbox" size={28} className="mx-auto text-apple-tertiary mb-2 block" />
          <div className="text-[14px] font-medium text-apple-text">No activity yet</div>
          <div className="text-[12px] text-apple-secondary mt-1">
            {filterActive
              ? "Try clearing the filters above."
              : "Edit an entry or add a new one. It'll show up here."}
          </div>
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.key}>
          <div className="sticky top-14 z-[1] -mx-1 px-1 py-1.5 mb-2 backdrop-blur-md bg-[#FBFBFD]/85 border-b border-apple-separator-light">
            <h2 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-apple-tertiary">
              {group.label}
            </h2>
          </div>
          <ul className="card divide-y divide-apple-separator-light overflow-hidden">
            {group.events.map((e) => (
              <ActivityRow key={e.id} event={e} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActivityRow({ event }: { event: Event }) {
  const meta = ACTION_META[event.action];
  const title = event.entry?.title ?? "(unknown entry)";
  const linkTarget = event.module ? `/modules/${event.module.slug}` : null;
  const userName = event.user?.name ?? "System";

  const titleNode = (
    <span className="text-[13px] font-medium text-apple-text truncate group-hover:text-pair transition-colors">
      {title}
    </span>
  );

  return (
    <li
      className="group grid items-center gap-x-3 gap-y-1 px-3 sm:px-5 py-3 hover:bg-surface-secondary/50 transition-colors
        grid-cols-[28px_92px_1fr_56px]
        sm:grid-cols-[32px_104px_180px_1fr_96px_64px]"
    >
      <div
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-pair-light text-pair flex items-center justify-center text-[10px] sm:text-[11px] font-semibold"
        title={userName}
      >
        {initials(event.user?.name)}
      </div>

      <span className={`badge ${meta.chip} justify-self-start`}>
        <Icon name={meta.icon} size={11} />
        {meta.label}
      </span>

      <span className="hidden sm:block text-[13px] text-apple-secondary truncate">
        <span className="font-medium text-apple-text">{userName}</span> {meta.verb}
      </span>

      <div className="min-w-0">
        {linkTarget ? (
          <Link to={linkTarget} className="group/title inline-flex items-center gap-0.5 min-w-0 max-w-full">
            {titleNode}
            <Icon name="arrow-right-up" size={12} className="text-apple-tertiary group-hover/title:text-pair shrink-0" />
          </Link>
        ) : (
          titleNode
        )}
      </div>

      <div className="justify-self-start hidden sm:flex min-w-0">
        {event.module && (
          <span className="badge badge-gray truncate">{event.module.label}</span>
        )}
      </div>

      <span className="text-[11px] text-apple-tertiary tabular-nums whitespace-nowrap justify-self-end">
        {timeLabel(event.timestamp)}
      </span>

      {event.detail && (
        <div
          className="col-span-full text-[11px] sm:text-[12px] text-apple-tertiary truncate pl-[40px] sm:pl-[152px]"
          title={event.detail}
        >
          {event.detail}
        </div>
      )}

      <span className="col-span-full text-[10px] text-apple-tertiary sm:hidden pl-[40px]">
        {userName} {meta.verb}
      </span>
    </li>
  );
}
