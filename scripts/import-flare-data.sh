#!/usr/bin/env bash
# Port Danah's Flare Fitness dataset into the prod `flare` tenant.
# Run from repo root: bash scripts/import-flare-data.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env.production ]; then
  echo "→ pulling prod env"
  vercel env pull .env.production --environment=production --yes
fi
set -a
# shellcheck disable=SC1091
source .env.production
set +a
cd apps/api
node --import tsx ../../scripts/import-flare-data.ts
