#!/usr/bin/env bash
# One-command demo bootstrap for The Brain.
# Brings up Postgres + Redis, applies migrations, seeds fixtures, starts API + web.
# Then the login screen's "Enter Demo →" button logs you straight in.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "→ creating .env from .env.example"
  cp .env.example .env
fi

# Export all .env vars into this shell (ignoring comments/blank lines)
set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "→ starting Postgres + Redis"
docker compose up -d

echo "→ waiting for Postgres to accept connections…"
for i in $(seq 1 30); do
  if docker exec the-brain-postgres-1 pg_isready -U app_migrate -d brain >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "→ installing deps (pnpm)"
pnpm install --silent

echo "→ running Prisma migrations"
pnpm --filter @brain/api prisma migrate deploy >/dev/null

echo "→ applying RLS policies"
docker exec -i the-brain-postgres-1 psql -U app_migrate -d brain -q < infra/migrations/0001_rls.sql >/dev/null
docker exec -i the-brain-postgres-1 psql -U app_migrate -d brain -q < infra/migrations/0002_admin_bypass.sql >/dev/null

echo "→ seeding future-kid tenant"
pnpm seed

cat <<'BANNER'

╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   The Brain is ready.                                          ║
║                                                                ║
║   Web:   http://localhost:5173                                 ║
║   API:   http://localhost:3100                                 ║
║                                                                ║
║   Click "Enter Demo →" on the login screen.                    ║
║   (Manual login: future-kid / demo@example.com / password1)    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

BANNER

echo "→ starting API + web (Ctrl-C to stop)"
pnpm dev
