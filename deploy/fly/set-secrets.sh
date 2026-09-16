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

# Parse KEY=VALUE without printing values; write import file for fly secrets.
# Avoid mapfile (bash 4+) — macOS ships bash 3.2.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

python3 - "$ENV_FILE" "$TMP" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
out = Path(sys.argv[2])
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

if not found:
    print("No secrets parsed", file=sys.stderr)
    sys.exit(1)

lines = []
for key in sorted(found):
    print(f"OK:{key}", file=sys.stderr)
    lines.append(f"{key}={found[key]}")
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

echo "Setting Fly secrets on app=$APP (values not printed)…"
# Pass via env file to avoid shell history / argv inspection of values where possible.
"${FLY[@]}" secrets import --app "$APP" < "$TMP"
echo "Done. Verify names with: ${FLY[*]} secrets list --app $APP"
