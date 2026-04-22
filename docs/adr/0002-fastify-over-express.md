# ADR 0002: Fastify over Express

Date: 2026-04-18
Status: Accepted

## Context

We needed an HTTP framework for the API. Requirements:

- TypeScript first,
- schema-based request/response validation,
- fast enough for serverless cold starts on Vercel,
- ecosystem of plugins for the usual (CORS, rate limiting, helmet, multipart, JWT, swagger),
- active maintenance.

Candidates: Express, Fastify, Koa, Hono, Nest.

## Decision

Fastify 4.

- Built-in Zod-like schema validation via JSON schema or `fastify-type-provider-zod`. We use the latter.
- Plugin system is properly encapsulated — `fastify-plugin` gives explicit control.
- Logger (pino) is the default; request IDs, structured logging, and log correlation are free.
- Performance headroom vs Express is meaningful for cold-start-sensitive workloads.
- Ecosystem has first-party plugins for everything we need (`@fastify/*`).

## Consequences

- Developers unfamiliar with Fastify need to learn plugin scoping. The tripping-point is that `await app.register(plugin)` is scoped to the current plugin unless `fastify-plugin` hoists the decoration. We hit this with `@fastify/multipart` (ADR-referenced fix: register at server root, not per route).
- Non-standard hooks (`onRequest`, `preHandler`, `onResponse`) replace Express middleware. This is a feature, not a quirk: we can attach auth at the route level with `{ onRequest: [app.authenticate] }` rather than ordering global middleware carefully.
- We lose access to some Express-only packages. In practice, all of them have Fastify equivalents.
