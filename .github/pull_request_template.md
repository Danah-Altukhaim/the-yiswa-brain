# Summary

<!-- One or two sentences: what changes and why. Link any issue or ADR. -->

## Changes

<!-- Bullet list of notable diffs. Keep it factual. -->

## Test plan

<!-- How you verified the change. Paste command output or describe the manual steps. -->

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (or `pnpm test:coverage` if coverage changes)
- [ ] Manual smoke test against a dev tenant (if UI or API change)

## Risk

- [ ] No schema change, or schema change is additive and backwards-compatible
- [ ] No change to RLS policies, or change has a new or updated test in `__tests__/rls-*`
- [ ] No change to auth flow, or change is covered by `__tests__/auth*`
- [ ] No new env var, or `.env.example` updated and `scripts/check-env-example.sh` passes
- [ ] No new secret touches the code, logs, or error messages

## Rollout

<!-- If this needs a migration, a feature flag, a staged rollout, or coordinated client work, spell it out. -->

## Rollback plan

<!-- How to revert if prod catches fire. "Revert PR" is fine for most things; for migrations or kill-switch flips, describe the exact steps. -->
