import { useAuth } from "../state/auth.js";

let isRedirecting = false;

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = useAuth.getState().token;
  const resp = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (resp.status === 401 && token) {
    useAuth.getState().signOut();
    if (!isRedirecting && !location.pathname.startsWith("/login")) {
      isRedirecting = true;
      location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
    throw new Error("Session expired");
  }
  const json = (await resp.json()) as { success: boolean; data?: T; error?: { message: string } };
  if (!resp.ok || !json.success) {
    throw new Error(json.error?.message ?? `HTTP ${resp.status}`);
  }
  return json.data as T;
}
