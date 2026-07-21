#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$project_dir/.env" ]] || { echo "Missing .env" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source "$project_dir/.env"
set +a
if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$project_dir/backend/migrations/002_governed_workflow.sql"
else
  : "${DB_NAME:?DB_NAME required}" "${DB_USER:?DB_USER required}" "${DB_PASSWORD:?DB_PASSWORD required}"
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -f "$project_dir/backend/migrations/002_governed_workflow.sql"
fi

