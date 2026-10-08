#!/usr/bin/env bash
# One-shot on the Mac: create a long-lived Fly deploy token and wire it for
# Cloud Agent + GitHub Actions so Mobile/Cloud can deploy without the Mac.
#
# Usage (from repo root):
#   ./deploy/fly/bootstrap-cloud-token.sh
#
# Then paste the printed token into the Cursor Cloud Agent secret FLY_API_TOKEN
# (chat / environment dashboard). This script already sets the GitHub Actions secret.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
APP="${FLY_APP:-the-daily-tailor}"
REPO="${GITHUB_REPO:-alessandroarmiento-lang/the-daily-tailor}"

export PATH="${HOME}/.fly/bin:/usr/local/bin:/opt/homebrew/bin:${PATH:-}"

if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
  echo "Install Fly CLI: curl -L https://fly.io/install.sh | sh" >&2
  exit 1
fi
FLY=(flyctl)
command -v flyctl >/dev/null 2>&1 || FLY=(fly)

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI (gh) and run: gh auth login" >&2
  exit 1
fi

if ! "${FLY[@]}" auth whoami >/dev/null 2>&1; then
  echo "Not logged into Fly — opening login…"
  "${FLY[@]}" auth login
fi

echo "Creating deploy token for app=${APP} (long expiry)…"
RAW="$("${FLY[@]}" tokens create deploy -x 999999h -a "$APP" 2>&1)" || {
  echo "$RAW" >&2
  exit 1
}
# Prefer the last line that looks like a token (not a human sentence).
TOKEN="$(
  printf '%s\n' "$RAW" | awk '
    {
      gsub(/\r/, "")
      line=$0
    }
    END { print line }
  '
)"
if [[ ${#TOKEN} -lt 20 ]]; then
  echo "Could not read token from flyctl output:" >&2
  printf '%s\n' "$RAW" >&2
  exit 1
fi

echo "Setting GitHub Actions secret FLY_API_TOKEN on ${REPO}…"
printf '%s' "$TOKEN" | gh secret set FLY_API_TOKEN --repo "$REPO"

echo
echo "OK — GitHub Actions secret saved."
echo
echo "NEXT (required once): paste this same token into the Cursor Cloud Agent"
echo "environment secret named FLY_API_TOKEN, then reply «fatto» in chat."
echo
echo "----- BEGIN FLY_API_TOKEN (copy all) -----"
printf '%s\n' "$TOKEN"
echo "----- END FLY_API_TOKEN -----"
echo
echo "Optional verify:"
echo "  gh workflow run fly-deploy.yml --repo ${REPO}"
echo "  # or: FLY_API_TOKEN=… ./deploy/fly/deploy.sh"
