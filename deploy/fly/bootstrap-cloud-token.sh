#!/usr/bin/env bash
# One-shot: create a long-lived Fly deploy token and wire it for
# Cloud Agent + GitHub Actions so Mobile/Cloud can deploy without the Mac.
#
# Usage (from repo root):
#   ./deploy/fly/bootstrap-cloud-token.sh
#
# Always prints the token. GitHub Actions secret is best-effort: Cursor's
# bundled `gh` often lacks secrets:write (HTTP 403) — then set it once in
# the GitHub website UI with the printed token.
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

GH_OK=0
if command -v gh >/dev/null 2>&1; then
  echo "Setting GitHub Actions secret FLY_API_TOKEN on ${REPO}…"
  if printf '%s' "$TOKEN" | gh secret set FLY_API_TOKEN --repo "$REPO" 2>/tmp/tdt-gh-secret.err; then
    GH_OK=1
    echo "OK — GitHub Actions secret saved."
  else
    echo "GitHub CLI could not set the secret (often HTTP 403 with Cursor's gh)."
    if [[ -s /tmp/tdt-gh-secret.err ]]; then
      cat /tmp/tdt-gh-secret.err >&2
    fi
    echo
    echo "Set it once in the browser:"
    echo "  https://github.com/${REPO}/settings/secrets/actions"
    echo "  → New repository secret → Name: FLY_API_TOKEN → paste the token below."
  fi
else
  echo "gh not installed — set the Actions secret in the browser:"
  echo "  https://github.com/${REPO}/settings/secrets/actions"
fi

echo
echo "NEXT (required once): paste this same token into the Cursor Cloud Agent"
echo "environment secret named FLY_API_TOKEN, then reply «fatto» in chat."
echo
echo "----- BEGIN FLY_API_TOKEN (copy all) -----"
printf '%s\n' "$TOKEN"
echo "----- END FLY_API_TOKEN -----"
echo
if [[ "$GH_OK" -eq 1 ]]; then
  echo "Optional verify: gh workflow run fly-deploy.yml --repo ${REPO}"
fi
echo "Or deploy here: FLY_API_TOKEN=… ./deploy/fly/deploy.sh"
rm -f /tmp/tdt-gh-secret.err
