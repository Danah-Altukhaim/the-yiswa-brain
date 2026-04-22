import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth.js";
import { useTenant } from "../state/tenant.js";

export function Login() {
  const setAuth = useAuth((s) => s.setAuth);
  const nav = useNavigate();
  const tenantStatus = useTenant((s) => s.status);
  const tenantBranding = useTenant((s) => s.branding);
  const requestedSlug = useTenant((s) => s.requestedSlug);

  const [tenantSlug, setTenantSlug] = useState("future-kid");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tenantStatus === "ready" && tenantBranding) setTenantSlug(tenantBranding.slug);
  }, [tenantStatus, tenantBranding]);

  async function submit(
    e: React.FormEvent | null,
    override?: { tenantSlug: string; email: string; password: string },
  ) {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const resp = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(override ?? { tenantSlug, email, password }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error?.message ?? "Login failed");
      setAuth(json.data);
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      nav(next && next.startsWith("/") ? next : "/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function enterDemoForSlug(slug: string) {
    if (!slug) return;
    submit(null, { tenantSlug: slug, email: "demo@example.com", password: "password1" });
  }

  const brandedTenant = tenantStatus === "ready" ? tenantBranding : null;

  if (tenantStatus === "missing") {
    return (
      <div className="min-h-screen min-h-[100svh] flex items-center justify-center bg-surface-secondary px-4 py-8">
        <div className="w-full max-w-[420px] text-center space-y-3 animate-scale-in">
          <h1 className="text-[22px] font-semibold tracking-tight text-apple-text">
            Workspace not found
          </h1>
          <p className="text-[14px] text-apple-secondary">
            We couldn't find a workspace at <span className="font-medium">{requestedSlug}</span>.
            Check the URL or sign in from your company's address.
          </p>
          <a href="https://thebrain.app" className="btn-secondary inline-block !mt-4">
            Go to thebrain.app
          </a>
        </div>
      </div>
    );
  }

  const showCompanyInput = !brandedTenant;
  const demoSlug = brandedTenant?.slug ?? "future-kid";
  const demoLabel = brandedTenant
    ? `Try the ${brandedTenant.name} demo`
    : "Enter as Sarah (Future Kid demo)";
  const title = brandedTenant?.name ?? "The Brain";
  const tagline = brandedTenant
    ? `Sign in to ${brandedTenant.name}`
    : "AI-native knowledge hub for your business";

  return (
    <div className="min-h-screen min-h-[100svh] flex items-center justify-center bg-surface-secondary px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-[420px] animate-scale-in">
        <div className="text-center mb-6">
          {brandedTenant?.logoUrl && (
            <img
              src={brandedTenant.logoUrl}
              alt={`${brandedTenant.name} logo`}
              className="mx-auto mb-3 h-12 w-auto object-contain"
            />
          )}
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.02em] text-apple-text">
            {title}
          </h1>
          <p className="text-[14px] text-apple-secondary mt-1">{tagline}</p>
        </div>

        <div className="card p-6 space-y-5">
          <button
            type="button"
            onClick={() => enterDemoForSlug(demoSlug)}
            disabled={busy}
            className="btn-primary w-full !py-3 !text-[15px]"
          >
            {busy ? "Entering…" : demoLabel}
          </button>
          <p className="text-[12px] text-apple-tertiary text-center -mt-2">
            One-click read-only demo, no password needed
          </p>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-apple-tertiary">
            <div className="flex-1 h-px bg-apple-separator" />
            Or sign in manually
            <div className="flex-1 h-px bg-apple-separator" />
          </div>

          <form onSubmit={(e) => submit(e)} className="space-y-3">
            {showCompanyInput && (
              <div>
                <span className="label">Company</span>
                <input
                  className="input-apple"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  autoComplete="organization"
                  placeholder="your-company"
                />
              </div>
            )}
            <div>
              <span className="label">Email</span>
              <input
                className="input-apple"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <span className="label">Password</span>
              <input
                className="input-apple"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>
            {err && (
              <p className="text-[13px] text-apple-red bg-apple-red/10 rounded-apple px-3 py-2">
                {err}
              </p>
            )}
            <button
              disabled={busy}
              className={brandedTenant ? "btn-primary w-full" : "btn-secondary w-full"}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-apple-tertiary mt-5">
          Powered by <span className="text-pair font-medium">Pair</span> · ©{" "}
          {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
