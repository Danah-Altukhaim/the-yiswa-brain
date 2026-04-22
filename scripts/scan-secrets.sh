#!/usr/bin/env bash
# Local secret scanner. Wraps gitleaks so devs can run the same check CI runs.
# Usage: scripts/scan-secrets.sh
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks not installed. Install via: brew install gitleaks" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Scanning working tree (no-git) for secrets..."
gitleaks detect --no-git --source . --redact --exit-code 1

echo "Scanning git history for secrets..."
gitleaks detect --source . --redact --exit-code 1

echo "Secret scan passed."
