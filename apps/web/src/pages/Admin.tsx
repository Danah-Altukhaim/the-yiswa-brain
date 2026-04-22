import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../components/Icon.js";

type Tenant = { id: string; name: string; slug: string };
type MarketplaceModule = { slug: string; label: string; description: string };

export function Admin() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplaceModule[]>([]);
  const [newTenant, setNewTenant] = useState({ name: "", slug: "" });
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<MarketplaceModule[]>("/api/v1/admin/marketplace").then(setMarketplace);
  }, []);

  async function createTenant() {
    const t = await api<Tenant>("/api/v1/admin/tenants", {
      method: "POST",
      body: JSON.stringify(newTenant),
    });
    setTenants([t, ...tenants]);
    setNewTenant({ name: "", slug: "" });
  }

  async function install(tenantId: string) {
    await api("/api/v1/admin/marketplace/install", {
      method: "POST",
      body: JSON.stringify({ tenantId, slugs: marketplace.map((m) => m.slug) }),
    });
    alert("Installed all marketplace modules.");
  }

  async function makeKey(tenantId: string) {
    const d = await api<{ apiKey: string }>("/api/v1/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ tenantId, label: "Bot key", scopes: ["read:kb", "write:analytics"] }),
    });
    setApiKey(d.apiKey);
  }

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <p className="text-[12px] text-apple-tertiary uppercase tracking-widest">Superadmin</p>
        <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-apple-text">PAIR Admin</h1>
        <p className="text-[13px] text-apple-secondary mt-0.5">Tenants, marketplace, API keys.</p>
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="text-[15px] font-semibold text-apple-text">Create tenant</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input-apple !py-2 w-full sm:flex-1 sm:min-w-[180px]"
            placeholder="Name"
            value={newTenant.name}
            onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
          />
          <input
            className="input-apple !py-2 w-full sm:flex-1 sm:min-w-[180px] font-mono"
            placeholder="slug"
            value={newTenant.slug}
            onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
          />
          <button onClick={createTenant} className="btn-primary w-full sm:w-auto">
            <Icon name="plus" size={15} />
            Create
          </button>
        </div>
      </section>

      <section className="card p-5 space-y-2">
        <h2 className="text-[15px] font-semibold text-apple-text mb-2">Tenants</h2>
        {tenants.length === 0 && (
          <p className="text-[13px] text-apple-tertiary">No tenants loaded yet.</p>
        )}
        {tenants.map((t) => (
          <div
            key={t.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-[13px] py-3 border-b border-apple-separator-light last:border-0"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="font-mono text-apple-secondary w-32 truncate shrink-0">{t.slug}</span>
              <span className="text-apple-text flex-1 truncate">{t.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => install(t.id)} className="btn-secondary !py-1.5 !text-[12px] flex-1 sm:flex-none">
                <Icon name="folder" size={13} />
                Install modules
              </button>
              <button onClick={() => makeKey(t.id)} className="btn-secondary !py-1.5 !text-[12px] flex-1 sm:flex-none">
                <Icon name="shield-keyhole" size={13} />
                API key
              </button>
            </div>
          </div>
        ))}
      </section>

      {apiKey && (
        <section className="card p-4 border-apple-orange/40 bg-apple-orange/5 space-y-2 animate-scale-in">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-widest text-apple-orange font-semibold">
              Copy now (shown once)
            </div>
            <button onClick={copyKey} className="btn-ghost !px-2 !py-1">
              <Icon name="copy" size={13} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <code className="block text-[12px] font-mono break-all text-apple-text bg-white rounded-apple p-3 border border-apple-separator">
            {apiKey}
          </code>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold text-apple-text mb-3">Marketplace</h2>
        <ul className="space-y-1.5 text-[13px]">
          {marketplace.map((m) => (
            <li key={m.slug} className="py-1.5 border-b border-apple-separator-light last:border-0">
              <span className="font-mono text-apple-secondary">{m.slug}</span>
              <span className="mx-2 text-apple-tertiary">·</span>
              <span className="text-apple-text font-medium">{m.label}</span>
              <div className="text-apple-secondary text-[12px] mt-0.5">{m.description}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
