#!/usr/bin/env bash
# Push IMAP/CalDAV secrets to Fly from local .env.local.
# Prints key *names* only — never secret values.
# Requires: flyctl logged in, Fly app already created.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.local}"
APP="${FLY_APP:-the-daily-tailor}"

if command -v flyctl >/dev/null 2>&1; then
  FLY=(flyctl)
elif command -v fly >/dev/null 2>&1; then
  FLY=(fly)
else
  echo "Install Fly CLI first: https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.example and fill IMAP/CalDAV values." >&2
  exit 1
fi

# Parse KEY=VALUE without printing values; build fly secrets set args.
mapfile -t SET_ARGS < <(python3 - "$ENV_FILE" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
raw = path.read_text(encoding="utf-8")
wanted = {
    "ICLOUD_MAIL_USER",
    "ICLOUD_MAIL_APP_PASSWORD",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "ICLOUD_CALDAV_USER",
    "ICLOUD_CALDAV_APP_PASSWORD",
    "ICLOUD_CALDAV_URL",
    "ICLOUD_CARDDAV_USER",
    "ICLOUD_CARDDAV_APP_PASSWORD",
    "GOOGLE_CALDAV_URL",
    "GOOGLE_CALDAV_USER",
    "GOOGLE_CALDAV_APP_PASSWORD",
}
required = {
    "ICLOUD_MAIL_USER",
    "ICLOUD_MAIL_APP_PASSWORD",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
}
found: dict[str, str] = {}
for line in raw.splitlines():
    s = line.strip()
    if not s or s.startswith("#") or "=" not in s:
        continue
    key, _, val = s.partition("=")
    key = key.strip()
    if key not in wanted:
        continue
    val = val.strip().strip('"').strip("'")
    if val:
        found[key] = val

missing = sorted(required - set(found))
if missing:
    for m in missing:
        print(f"MISSING:{m}", file=sys.stderr)
    sys.exit(2)

for key in sorted(found):
    print(f"OK:{key}", file=sys.stderr)
    print(f"{key}={found[key]}")
PY
)

if [[ "${#SET_ARGS[@]}" -eq 0 ]]; then
  echo "No secrets parsed from $ENV_FILE" >&2
  exit 1
fi

echo "Setting Fly secrets on app=$APP (values not printed)…"
# Pass via env file to avoid shell history / argv inspection of values where possible.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
printf '%s\n' "${SET_ARGS[@]}" > "$TMP"
"${FLY[@]}" secrets import --app "$APP" < "$TMP"
echo "Done. Verify names with: ${FLY[*]} secrets list --app $APP"
