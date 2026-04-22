#!/usr/bin/env bash
# Ensure every tenant has a demo@<slug>.pair / password1 user.
# Run from repo root: bash scripts/backfill-demo-users.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env.production ]; then
  echo "missing .env.production — run: vercel env pull .env.production --environment=production --yes" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.production
set +a
cd apps/api
exec node --import tsx ../../scripts/backfill-demo-users.ts
