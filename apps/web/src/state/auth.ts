import { create } from "zustand";
import { useModules } from "./modules.js";

type State = {
  token: string | null;
  user: { id: string; name: string; role: string; walkthroughCompleted?: boolean } | null;
  tenant: { id: string; slug: string; name: string } | null;
  setAuth: (payload: { token: string; user: State["user"]; tenant: State["tenant"] }) => void;
  signOut: () => void;
};

const STORAGE_KEY = "brain.auth";

function load(): Partial<State> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// Clear every tenant-scoped store so a new sign-in never renders stale modules.
function invalidateTenantScopedStores() {
  useModules.getState().reset();
}

export const useAuth = create<State>((set) => ({
  token: (load().token as string) ?? null,
  user: (load().user as State["user"]) ?? null,
  tenant: (load().tenant as State["tenant"]) ?? null,
  setAuth: ({ token, user, tenant }) => {
    invalidateTenantScopedStores();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, tenant }));
    set({ token, user, tenant });
  },
  signOut: () => {
    invalidateTenantScopedStores();
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null, tenant: null });
  },
}));
