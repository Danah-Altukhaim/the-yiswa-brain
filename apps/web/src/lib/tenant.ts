// Subdomain → tenant slug resolution for multi-tenant routing.
// Runs pre-auth so the login page can fetch branding before the user signs in.

const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app", "staging", "preview"]);
const SLUG_RE = /^[a-z][a-z0-9-]{0,63}$/;

const VERCEL_ALIAS_SUFFIX = "-brain";

/**
 * Extracts the tenant slug from the current host.
 *
 * - `flare.thebrain.app` → "flare"                (real domain, wildcard cert)
 * - `flare-brain.vercel.app` → "flare"             (per-tenant Vercel aliases, shareable today)
 * - `future-kid-brain.vercel.app` → "future-kid"
 * - `flare.localhost` / `flare.localhost:5173` → "flare"  (dev)
 * - apex (`thebrain.app`, `the-brain-pair.vercel.app`, `localhost`) → falls back to `?tenant=`
 * - `www.*` and other reserved labels → null (apex behavior)
 */
export function getTenantSlugFromHost(hostname: string, search: string): string | null {
  const host = hostname.toLowerCase().split(":")[0] ?? "";
  const labels = host.split(".");
  const first = labels[0] ?? "";
  const last = labels[labels.length - 1] ?? "";
  const secondLast = labels[labels.length - 2] ?? "";

  let candidate: string | null = null;

  // *.thebrain.app (real domain, when DNS ships)
  if (labels.length >= 3 && secondLast === "thebrain" && last === "app") {
    candidate = first;
  }
  // <slug>-brain.vercel.app — per-tenant aliases used for shareable links today.
  // The apex project is `the-brain-pair.vercel.app`; we skip it via reserved set below.
  else if (
    labels.length === 3 &&
    secondLast === "vercel" &&
    last === "app" &&
    first.endsWith(VERCEL_ALIAS_SUFFIX) &&
    first.length > VERCEL_ALIAS_SUFFIX.length
  ) {
    candidate = first.slice(0, -VERCEL_ALIAS_SUFFIX.length);
  }
  // Dev: *.localhost
  else if (labels.length >= 2 && last === "localhost") {
    candidate = first;
  }

  if (candidate && !RESERVED_SUBDOMAINS.has(candidate) && SLUG_RE.test(candidate)) {
    return candidate;
  }

  // Fallback: explicit ?tenant=<slug> query param
  const params = new URLSearchParams(search);
  const qs = params.get("tenant");
  if (qs && SLUG_RE.test(qs) && !RESERVED_SUBDOMAINS.has(qs)) return qs;

  return null;
}
