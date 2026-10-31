#!/usr/bin/env bash
# Product hook called by deploy/land_on_main.sh after a successful land.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -z "${FLY_API_TOKEN:-}" ]]; then
  echo "LAND_ON_MAIN: no FLY_API_TOKEN here — relying on GitHub Actions fly-deploy.yml"
  echo "LAND_ON_MAIN: if Actions lacks the secret, set FLY_API_TOKEN (see SETUP.md §12)"
  exit 0
fi
echo "LAND_ON_MAIN: FLY_API_TOKEN present — deploying Fly…"
if [[ -x "$ROOT/deploy/fly/deploy.sh" ]]; then
  "$ROOT/deploy/fly/deploy.sh"
fi
