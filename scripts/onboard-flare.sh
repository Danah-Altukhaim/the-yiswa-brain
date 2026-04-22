#!/usr/bin/env bash
# Reads DATABASE_URL from .env.production and onboards the Flare tenant.
# Run from repo root: bash scripts/onboard-flare.sh
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
exec node --import tsx ../../scripts/onboard-tenant.ts \
  --slug=flare --name=Flare \
  --admin-email=mohammedkhalifamail@gmail.com \
  --admin-name=Mohammed \
  --primary-color=#FF6B35
