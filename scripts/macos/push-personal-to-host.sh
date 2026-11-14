#!/usr/bin/env bash
# Push Apple Calendar (events + scheduled reminders) and the health strip
# from this Mac to the always-on host. Token stays out of argv and logs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"
HOST="${INGEST_HOST:-https://the-daily-tailor.fly.dev}"
URL="$HOST/api/personal/ingest"
BIN="$ROOT/scripts/macos/bin/fetch-calendar-eventkit"
export PATH="${HOME}/.local/node/bin:/usr/local/bin:/opt/homebrew/bin:${PATH}"

if [[ "${1:-}" == "--warm" ]]; then
  URL="$URL?warm=1"
fi

if [[ ! -x "$BIN" ]]; then
  echo "EventKit tool mancante: esegui ./scripts/macos/build-eventkit-tools.sh" >&2
  exit 1
fi

TOKEN="${REMINDERS_INGEST_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$ENV_FILE" ]]; then
  TOKEN="$(python3 - "$ENV_FILE" <<'PY'
import sys
from pathlib import Path

for line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if s.startswith("REMINDERS_INGEST_TOKEN=") and not s.startswith("#"):
        print(s.partition("=")[2].strip().strip('"').strip("'"))
        break
PY
)"
fi

if [[ -z "$TOKEN" ]]; then
  echo "REMINDERS_INGEST_TOKEN assente in $ENV_FILE (o nell'ambiente)." >&2
  exit 1
fi

DATE_KEY="$(TZ=Europe/Rome date +%Y-%m-%d)"
HOUR="$(TZ=Europe/Rome date +%H)"
if [[ "$HOUR" -lt 6 ]]; then
  DATE_KEY="$(TZ=Europe/Rome date -v-1d +%Y-%m-%d 2>/dev/null || TZ=Europe/Rome date -d 'yesterday' +%Y-%m-%d)"
fi

CAL_OUT="$(mktemp)"
HEALTH_OUT="$(mktemp)"
PAYLOAD="$(mktemp)"
trap 'rm -f "$CAL_OUT" "$HEALTH_OUT" "$PAYLOAD"' EXIT

"$BIN" 6 > "$CAL_OUT"
npx --yes tsx "$ROOT/scripts/macos/print-health-summary.ts" "$DATE_KEY" > "$HEALTH_OUT"

python3 - "$CAL_OUT" "$HEALTH_OUT" "$PAYLOAD" <<'PY'
import json
import sys
from pathlib import Path

cal = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not cal.get("ok"):
    print(cal.get("error", "Calendar fetch fallito"), file=sys.stderr)
    sys.exit(1)
health = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
events = cal.get("items") or []
lines = health.get("lines") or []
Path(sys.argv[3]).write_text(
    json.dumps({"device": "Mac", "calendar": events, "health": {"lines": lines}}),
    encoding="utf-8",
)
print(f"{len(events)} eventi, {len(lines)} righe salute", file=sys.stderr)
PY

printf 'header = "X-Ingest-Token: %s"\n' "$TOKEN" |
  curl --config - \
    --silent --show-error --fail-with-body --max-time 240 \
    --retry 3 --retry-delay 20 --retry-all-errors \
    -X POST "$URL" \
    -H 'Content-Type: application/json' \
    --data-binary "@$PAYLOAD"
echo
