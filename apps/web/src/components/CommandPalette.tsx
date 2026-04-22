import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { Icon } from "./Icon.js";

type Module = { id: string; slug: string; label: string; icon?: string };

type EntryHit = {
  id: string;
  module_id: string;
  module_slug: string;
  module_label: string;
  data: Record<string, unknown> | unknown;
  updated_at: string;
  created_by_name: string | null;
};

type NavItem = {
  key: string;
  kind: "page" | "module" | "entry";
  label: string;
  sublabel?: string;
  to: string;
  icon: string;
};

const STATIC_PAGES: Array<{ label: string; to: string; icon: string; keywords: string }> = [
  { label: "Knowledge", to: "/", icon: "folder", keywords: "knowledge home modules" },
  { label: "Activity", to: "/activity", icon: "activity", keywords: "activity audit history log" },
  { label: "Admin", to: "/admin", icon: "shield-keyhole", keywords: "admin settings users tenant" },
  { label: "Brain Chat", to: "/chat", icon: "chat", keywords: "chat ai ask" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickEntryTitle(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const keys = [
    "name",
    "name_en",
    "name_ar",
    "title",
    "title_en",
    "title_ar",
    "question",
    "question_en",
    "question_ar",
    "label",
  ];
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(d)) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickEntrySnippet(data: unknown, query: string): string {
  if (!data || typeof data !== "object") return "";
  const needle = normalize(query);
  const values: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") values.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(data);
  for (const text of values) {
    const idx = normalize(text).indexOf(needle);
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + needle.length + 60);
      return (
        (start > 0 ? "..." : "") +
        text.slice(start, end).replace(/\s+/g, " ").trim() +
        (end < text.length ? "..." : "")
      );
    }
  }
  return values[0]?.slice(0, 120) ?? "";
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const needle = normalize(query);
  const hay = normalize(text);
  const idx = hay.indexOf(needle);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-apple-text rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function CommandPalette({
  open,
  onClose,
  modules,
}: {
  open: boolean;
  onClose: () => void;
  modules: Module[];
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hits, setHits] = useState<EntryHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setHits([]);
      setActiveIdx(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 160);
    return () => clearTimeout(h);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    if (!debounced) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<EntryHit[]>(`/api/v1/entries/search?q=${encodeURIComponent(debounced)}&limit=30`)
      .then((data) => {
        if (!cancelled) setHits(data);
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const items = useMemo<NavItem[]>(() => {
    const q = normalize(query.trim());
    const out: NavItem[] = [];

    if (q) {
      for (const p of STATIC_PAGES) {
        if (normalize(p.label).includes(q) || normalize(p.keywords).includes(q)) {
          out.push({ key: `page:${p.to}`, kind: "page", label: p.label, to: p.to, icon: p.icon });
        }
      }
      for (const m of modules) {
        if (normalize(m.label).includes(q) || normalize(m.slug).includes(q)) {
          out.push({
            key: `module:${m.slug}`,
            kind: "module",
            label: m.label,
            sublabel: "Module",
            to: `/modules/${m.slug}`,
            icon: m.icon || "folder",
          });
        }
      }
      for (const h of hits) {
        const title = pickEntryTitle(h.data) || `Entry ${h.id.slice(0, 6)}`;
        const snippet = pickEntrySnippet(h.data, query.trim());
        const parts = [h.module_label];
        if (h.created_by_name) parts.push(`by ${h.created_by_name}`);
        if (snippet) parts.push(snippet);
        out.push({
          key: `entry:${h.id}`,
          kind: "entry",
          label: title,
          sublabel: parts.join(" \u00b7 "),
          to: `/modules/${h.module_slug}?entry=${encodeURIComponent(h.id)}`,
          icon: "document",
        });
      }
    } else {
      for (const p of STATIC_PAGES) {
        out.push({ key: `page:${p.to}`, kind: "page", label: p.label, to: p.to, icon: p.icon });
      }
      for (const m of modules.slice(0, 8)) {
        out.push({
          key: `module:${m.slug}`,
          kind: "module",
          label: m.label,
          sublabel: "Module",
          to: `/modules/${m.slug}`,
          icon: m.icon || "folder",
        });
      }
    }
    return out;
  }, [query, modules, hits]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, hits]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  const choose = useCallback(
    (item: NavItem) => {
      onClose();
      navigate(item.to);
    },
    [navigate, onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[activeIdx];
        if (item) choose(item);
      }
    },
    [items, activeIdx, choose, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-xl bg-white rounded-apple-lg shadow-apple-xl border border-apple-separator overflow-hidden animate-scale-in">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-apple-separator-light">
          <Icon name="search" size={16} className="text-apple-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search knowledge, modules, pages..."
            className="flex-1 bg-transparent border-0 outline-none text-[15px] text-apple-text placeholder:text-apple-tertiary"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[10px] font-mono text-apple-tertiary border border-apple-separator rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {loading && debounced && (
            <div className="px-4 py-3 text-[12px] text-apple-tertiary">Searching...</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-apple-secondary">
              {query ? (
                <>
                  No results for <span className="font-medium text-apple-text">"{query}"</span>
                </>
              ) : (
                "Start typing to search."
              )}
            </div>
          )}
          {items.length > 0 && (
            <div className="py-1.5">
              {items.map((item, i) => (
                <button
                  key={item.key}
                  data-idx={i}
                  type="button"
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => choose(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === activeIdx ? "bg-pair-light/50" : "hover:bg-black/[0.03]"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-apple flex items-center justify-center shrink-0 ${
                      item.kind === "entry"
                        ? "bg-indigo-50 text-indigo-600"
                        : item.kind === "module"
                          ? "bg-pair-light text-pair"
                          : "bg-surface-tertiary/60 text-apple-secondary"
                    }`}
                  >
                    <Icon name={item.icon} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-apple-text truncate">
                      {highlight(item.label, query.trim())}
                    </span>
                    {item.sublabel && (
                      <span className="block text-[12px] text-apple-secondary truncate">
                        {highlight(item.sublabel, query.trim())}
                      </span>
                    )}
                  </span>
                  {i === activeIdx && (
                    <kbd className="shrink-0 text-[10px] font-mono text-apple-tertiary border border-apple-separator rounded px-1.5 py-0.5">
                      ↵
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-apple-separator-light bg-[#FAFAFA] text-[11px] text-apple-tertiary">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono border border-apple-separator rounded px-1">↑</kbd>
              <kbd className="font-mono border border-apple-separator rounded px-1">↓</kbd>
              navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="font-mono border border-apple-separator rounded px-1">↵</kbd>
              open
            </span>
          </div>
          <span>
            {items.length} result{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
