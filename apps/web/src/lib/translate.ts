import { useEffect, useState } from "react";
import { api } from "./api.js";

const memCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const STORAGE_PREFIX = "tx::";

function lsKey(text: string, target: "en" | "ar"): string {
  return `${STORAGE_PREFIX}${target}::${text}`;
}

function readLs(text: string, target: "en" | "ar"): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lsKey(text, target));
  } catch {
    return null;
  }
}

function writeLs(text: string, target: "en" | "ar", value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(text, target), value);
  } catch {
    // Quota exceeded; silently drop. The mem cache still works for the session.
  }
}

export function peekTranslation(text: string | null | undefined, target: "en" | "ar"): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const k = `${target}::${trimmed}`;
  return memCache.get(k) ?? readLs(trimmed, target);
}

export async function translateText(text: string, target: "en" | "ar"): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const k = `${target}::${trimmed}`;
  const mem = memCache.get(k);
  if (mem) return mem;
  const ls = readLs(trimmed, target);
  if (ls) {
    memCache.set(k, ls);
    return ls;
  }
  const existing = inflight.get(k);
  if (existing) return existing;
  const p = api<{ translated: string }>("/api/v1/translate", {
    method: "POST",
    body: JSON.stringify({ text: trimmed, target }),
  })
    .then((r) => {
      memCache.set(k, r.translated);
      writeLs(trimmed, target, r.translated);
      inflight.delete(k);
      return r.translated;
    })
    .catch((err) => {
      inflight.delete(k);
      throw err;
    });
  inflight.set(k, p);
  return p;
}

export function useAutoTranslation(
  source: string | null | undefined,
  target: "en" | "ar",
  enabled: boolean,
): { value: string; loading: boolean; error: string | null } {
  const [value, setValue] = useState<string>(() => {
    if (!source) return "";
    return memCache.get(`${target}::${source.trim()}`) ?? readLs(source.trim(), target) ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !source || !source.trim()) {
      setValue("");
      setLoading(false);
      setError(null);
      return;
    }
    const cached = memCache.get(`${target}::${source.trim()}`) ?? readLs(source.trim(), target);
    if (cached) {
      setValue(cached);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    translateText(source, target)
      .then((out) => {
        if (cancelled) return;
        setValue(out);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Translation failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, target, enabled]);

  return { value, loading, error };
}
