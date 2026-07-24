#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$project_dir/.env" ]]; then
  echo "Missing .env; copy .env.example and configure it." >&2
  exit 1
fi
set -a
source "$project_dir/.env"
set +a
for dir in "backend" "frontend"; do
  [[ "$dir" == "." ]] && check="$project_dir/node_modules" || check="$project_dir/$dir/node_modules"
  if [[ ! -d "$check" ]]; then
    echo "Dependencies missing for $dir; run scripts/bootstrap.sh." >&2
    exit 1
  fi
done

cleanup() {
  [[ -n "${backend_pid:-}" ]] && kill "$backend_pid" 2>/dev/null || true
  [[ -n "${frontend_pid:-}" ]] && kill "$frontend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$project_dir/backend"
npm start &
backend_pid=$!

cd "$project_dir/frontend"
npm run dev -- --port "${FRONTEND_PORT:-3001}" &
frontend_pid=$!

echo "Application processes started. Startup does not install, migrate, seed, or terminate unrelated processes."
wait "$backend_pid" "$frontend_pid"
