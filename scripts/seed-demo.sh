#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "${CONFIRM_DEMO_SEED:-}" == "yes" ]] || { echo "Set CONFIRM_DEMO_SEED=yes to acknowledge demo-data mutation" >&2; exit 1; }
[[ -f "$project_dir/.env" ]] || { echo "Missing .env" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$project_dir/.env"
set +a
[[ "${NODE_ENV:-development}" != "production" ]] || { echo "Demo seeding is forbidden in production" >&2; exit 1; }
cd "$project_dir"
curl -fsS -X POST -H "Authorization: Bearer $DEMO_ADMIN_TOKEN" "http://localhost:${BACKEND_PORT:-4001}/api/seed"
