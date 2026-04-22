/**
 * Prometheus metrics. Exposed at /metrics and protected by the api-key middleware
 * registered in server.ts. Never expose unauthenticated — tenant IDs leak cardinality.
 */
import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";

export const registry = new Registry();
registry.setDefaultLabels({ service: "brain-api" });
collectDefaultMetrics({ register: registry });

export const authLoginTotal = new Counter({
  name: "auth_login_total",
  help: "Login attempts, labelled by outcome.",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const llmCallTotal = new Counter({
  name: "llm_call_total",
  help: "LLM SDK calls, labelled by provider, model, and outcome.",
  labelNames: ["provider", "model", "status"] as const,
  registers: [registry],
});

export const llmCallDurationMs = new Histogram({
  name: "llm_call_duration_ms",
  help: "LLM SDK call wall-clock latency in milliseconds.",
  labelNames: ["provider", "model"] as const,
  buckets: [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000],
  registers: [registry],
});

// Counts how often the admin-bypass path is taken (login, api-key lookup,
// explicit admin endpoints). Expected to be low and bounded — a sudden
// spike points at abuse or a misplaced `isAdmin = true` in a route.
export const adminBypassTotal = new Counter({
  name: "admin_bypass_total",
  help: "Transactions entered with RLS bypass flag set (admin-only paths).",
  labelNames: ["reason"] as const,
  registers: [registry],
});

export const httpRequestDurationMs = new Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request wall-clock latency in milliseconds.",
  labelNames: ["method", "route", "status_class"] as const,
  buckets: [10, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000],
  registers: [registry],
});
