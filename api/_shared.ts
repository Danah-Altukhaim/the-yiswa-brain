// Shared helpers for the demo API stub under /api/v1/*.
// All data comes from api/_fixtures.ts which is a static snapshot of the
// local seed database. Writes do not persist; this is a read-only demo.

export { MODULES, ENTRIES_BY_SLUG } from "./_fixtures";

export type VercelReq = {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
};

export type VercelRes = {
  status(code: number): VercelRes;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

export const TENANT = { id: "demo-tenant", slug: "future-kid", name: "Future Kid" };
export const USER = {
  id: "demo-user",
  email: "demo@example.com",
  name: "Demo (Editor)",
  role: "CLIENT_EDITOR",
};

export function ok<T>(res: VercelRes, data: T): void {
  res.status(200);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ success: true, data }));
}

export function fail(res: VercelRes, message: string, status = 400): void {
  res.status(status);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ success: false, error: { message } }));
}

export function methodNotAllowed(res: VercelRes): void {
  fail(res, "method not allowed", 405);
}
