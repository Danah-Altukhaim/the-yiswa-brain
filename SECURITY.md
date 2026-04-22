# Security policy

## Reporting a vulnerability

Please do **not** file a public GitHub issue for security reports.

Email the security contact at **security@pair.ai** with:

- a description of the issue,
- steps to reproduce (proof-of-concept if possible),
- the affected endpoint or component,
- the version or commit hash.

We aim to acknowledge reports within 2 business days and to ship a fix or a mitigation within 30 days for high-severity issues.

## Scope

In scope:

- the API under `apps/api`
- the web app under `apps/web`
- the Next.js dashboard under `../activity-briefing`
- the Docker image
- CI workflow and Dockerfile secrets handling

Out of scope:

- denial of service via traffic flooding
- vulnerabilities in upstream providers (Vercel, Neon, Cloudflare, Anthropic, OpenAI) — please report those directly to the provider.
- social engineering of our team.

## Practices we follow

- Row-level security for tenant isolation (see `docs/adr/0001-postgres-rls-for-tenancy.md`).
- A CI gate that proves cross-tenant reads return zero rows (`__tests__/rls-leak.test.ts`).
- Secret scanning on every push (gitleaks in `.github/workflows/ci.yml`).
- Dependency scanning (`pnpm audit --audit-level=high`) blocks CI on high-severity advisories.
- Security headers via `@fastify/helmet` and Next.js `headers()`.
- Login endpoint rate-limited; bcrypt hashing; constant-time compare against a dummy hash on unknown users.
- No secret ever logged or sent to Sentry (see the allowlist in `apps/api/src/lib/sentry.ts`).

## Handling disclosed issues

Once a report is verified, we:

1. Triage within 48 hours and assign a severity (CRITICAL / HIGH / MEDIUM / LOW).
2. Open a private branch and start the fix.
3. Coordinate disclosure: we do not publish details until a fix is deployed.
4. Credit the reporter in release notes unless they prefer anonymity.

## Secret rotation schedule

Every secret has a maximum age. We rotate on this cadence in normal operation, and immediately on incident (see `docs/runbooks/auth-incident.md`).

| Secret                                                        | Rotation                    | Trigger for off-cycle rotation                              |
| ------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `JWT_ACCESS_SECRET`                                           | 90 days                     | suspected token leak, former employee offboarding           |
| `JWT_REFRESH_SECRET`                                          | 180 days                    | suspected session-store compromise                          |
| `JWT_KID`                                                     | on each JWT secret rotation | paired with the secret                                      |
| Tenant API keys (`tb_live_*`)                                 | on customer request         | customer reports leak, or staff with access departs         |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`                         | 180 days                    | key ever copied to a shared channel, provider breach notice |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`                   | 180 days                    | access log shows unexpected IP                              |
| `WHATSAPP_TOKEN`                                              | per Meta app token TTL      | Meta revocation, staff change                               |
| `SMTP_URL` (with creds)                                       | 180 days                    | mail provider breach                                        |
| Database credentials (`DATABASE_URL`, `DATABASE_MIGRATE_URL`) | 180 days, separately        | suspected RLS bypass, migrate role compromise               |

Rotation procedure for every secret is the same in outline:

1. Mint the new value in the provider (Anthropic, R2, Neon, SMTP, etc.).
2. Publish the new value to Vercel env (and the Docker/long-running host if cron runs there), with the old value still present under a `_PREVIOUS` suffix where the code supports dual-read.
3. Deploy. Verify the service is still healthy against the new value.
4. Remove the old value from every environment.
5. Revoke the old value at the provider.
6. Record the rotation in the ops log with date, operator, and reason.

JWT secrets additionally require bumping `JWT_KID` so refresh tokens signed with the old key can be recognised and rejected cleanly by the verifier.
