import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { Login } from "./pages/Login.js";
import { Layout } from "./components/Layout.js";
import { Knowledge } from "./pages/Knowledge.js";
import { useAuth } from "./state/auth.js";
import { useTenant } from "./state/tenant.js";
import { getTenantSlugFromHost } from "./lib/tenant.js";
import "./index.css";

// Resolve tenant from subdomain and fire off branding fetch before render.
// The login page reads from the tenant store reactively, so we don't await.
const tenantSlug = getTenantSlugFromHost(window.location.hostname, window.location.search);
if (tenantSlug) {
  void useTenant.getState().fetchTenant(tenantSlug);
}

const BrainChat = lazy(() =>
  import("./pages/BrainChat.js").then((m) => ({ default: m.BrainChat })),
);
const ModulePage = lazy(() =>
  import("./pages/ModulePage.js").then((m) => ({ default: m.ModulePage })),
);
const Admin = lazy(() => import("./pages/Admin.js").then((m) => ({ default: m.Admin })));
const Activity = lazy(() => import("./pages/Activity.js").then((m) => ({ default: m.Activity })));

function Guard({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-[48px] font-bold text-apple-text tracking-tight">404</h1>
      <p className="text-[15px] text-apple-secondary mt-2 mb-6">This page does not exist.</p>
      <Link to="/" className="btn-primary">
        Go home
      </Link>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-surface-secondary">
          <h1 className="text-[24px] font-semibold text-apple-text">Something went wrong</h1>
          <p className="text-[14px] text-apple-secondary mt-2 mb-6">
            An unexpected error occurred.
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Guard>
                <Layout />
              </Guard>
            }
          >
            <Route index element={<Knowledge />} />
            <Route path="chat" element={<BrainChat />} />
            <Route path="modules/:slug" element={<ModulePage />} />
            <Route path="admin" element={<Admin />} />
            <Route path="activity" element={<Activity />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
