# Runbook: Authentication incident

For login failures, account lockouts, or suspected credential compromise.

## Signals

- Sentry events tagged `route:/api/v1/auth/login` spiking.
- `auth_login_total{result="fail"}` rate > 10/min from a single IP.
- User report: "I cannot log in."
- Security report: "Possible credential leak."

## Diagnose

1. **Confirm blast radius.** Is one user affected, one tenant, or many? Query the API access log (`pino` output to stdout, shipped to the central log store) for the user's tenant slug + email.
2. **Check rate-limit state.** The login route is capped at 5 attempts per 5 minutes per IP by `@fastify/rate-limit`. Look for 429 responses in logs.
3. **Check DB connectivity.** The login path runs a `prisma.$transaction`. If Neon is degraded, logins will 500 — see `db-failover.md`.
4. **Check JWT secret validity.** If `JWT_ACCESS_SECRET` was rotated and old tokens remain in clients, they get 401 on their next request. This is expected — force a re-login rather than rolling back.

## Mitigate

### Single-user lockout

- Explain the 5/5min rate limit; user should wait or retry from a different IP.
- If the password is the issue, reset via the admin console (`/api/v1/admin/users/:id/password`, admin role required).

### Mass failed-logins from one IP (credential stuffing)

- Identify the IP in logs.
- Add a temporary block at the edge (Vercel WAF rule, Cloudflare rule, etc.).
- Open a Sentry issue to track false positives once the block is in place.

### Suspected secret compromise (JWT or DB)

1. **Rotate JWT secrets in Vercel env.**
   ```
   vercel env add JWT_ACCESS_SECRET production
   vercel env add JWT_REFRESH_SECRET production
   vercel deploy --prod
   ```
2. All existing sessions are invalidated — expect a spike of 401s as clients re-login. Monitor `auth_login_total{result="success"}` to confirm recovery.
3. **Rotate DB password (Neon).** Update via Neon console → Roles → Reset password. Update `DATABASE_URL` and `DATABASE_MIGRATE_URL` in Vercel env. Redeploy.
4. Force audit: `SELECT * FROM audit_logs WHERE action = 'login' AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC;` to spot suspicious admin activity in the window.

## Verify

- `auth_login_total{result="success"}` returns to baseline.
- No 401 wave persists beyond 30 minutes (users finish re-login).
- No Sentry events tagged `auth` in the last 15 minutes.
