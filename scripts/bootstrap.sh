#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$project_dir/.env" ]] || cp "$project_dir/.env.example" "$project_dir/.env"
cd "$project_dir/backend"
npm ci
cd "$project_dir/frontend"
npm ci
echo "Dependencies installed from lockfiles. Review .env before migration or startup."

