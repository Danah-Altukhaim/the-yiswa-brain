#!/usr/bin/env bash
# CI gate: fail if any env key referenced by apps/api/src/lib/env.ts is missing from .env.example.
# Catches drift where a new env var is introduced without being documented.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_TS="$ROOT/apps/api/src/lib/env.ts"
ENV_EXAMPLE="$ROOT/.env.example"

if [[ ! -f "$ENV_TS" ]]; then
  echo "env.ts not found at $ENV_TS" >&2
  exit 2
fi
if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo ".env.example not found at $ENV_EXAMPLE" >&2
  exit 2
fi

missing=0
# Extract UPPER_SNAKE_CASE keys that appear as Zod object keys. Matches e.g. `DATABASE_URL: z.string()`.
keys=$(grep -Eo '^[[:space:]]{2,}[A-Z][A-Z0-9_]+[[:space:]]*:' "$ENV_TS" | sed -E 's/[[:space:]]*:.*//;s/^[[:space:]]+//')

for key in $keys; do
  if ! grep -qE "^${key}=" "$ENV_EXAMPLE"; then
    echo "missing in .env.example: $key"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "Add any missing keys to .env.example (blank value is fine for secrets)." >&2
  exit 1
fi

echo ".env.example parity OK"
