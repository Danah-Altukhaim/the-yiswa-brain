import { create } from "zustand";

export type TenantBranding = {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  faviconUrl: string | null;
};

export type TenantStatus = "idle" | "loading" | "ready" | "missing" | "error";

type State = {
  status: TenantStatus;
  branding: TenantBranding | null;
  requestedSlug: string | null;
  fetchTenant: (slug: string) => Promise<void>;
};

function applyBranding(b: TenantBranding) {
  if (typeof document === "undefined") return;
  document.title = b.name;
  if (b.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.faviconUrl;
  }
  if (b.primaryColor) {
    document.documentElement.style.setProperty("--tenant-primary", b.primaryColor);
  }
}

export const useTenant = create<State>((set, get) => ({
  status: "idle",
  branding: null,
  requestedSlug: null,
  fetchTenant: async (slug: string) => {
    if (get().status === "loading" && get().requestedSlug === slug) return;
    set({ status: "loading", requestedSlug: slug });
    try {
      // Hobby plan caps serverless functions — there's no per-slug endpoint.
      // Pull the full list and filter client-side. Tenant list is non-sensitive.
      const resp = await fetch("/api/v1/public/tenants");
      if (!resp.ok) {
        set({ status: "error", branding: null });
        return;
      }
      const json = (await resp.json()) as { success: boolean; data?: TenantBranding[] };
      if (!json.success || !Array.isArray(json.data)) {
        set({ status: "error", branding: null });
        return;
      }
      const match = json.data.find((t) => t.slug === slug);
      if (!match) {
        set({ status: "missing", branding: null });
        return;
      }
      applyBranding(match);
      set({ status: "ready", branding: match });
    } catch {
      set({ status: "error", branding: null });
    }
  },
}));
