#!/usr/bin/env bash
# Push open Apple Reminders (EventKit) from this Mac to the always-on host.
# Same endpoint the iPhone Shortcut uses — handy fallback / test while the Mac is awake.
# Token is read from .env.local and never printed or passed through argv.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"
HOST="${INGEST_HOST:-https://the-daily-tailor.fly.dev}"
URL="$HOST/api/reminders/ingest"
POOL="${REMINDERS_POOL:-60}"
BIN="$ROOT/scripts/macos/bin/fetch-reminders-eventkit"

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

PAYLOAD="$(mktemp)"
EVENTKIT_OUT="$(mktemp)"
trap 'rm -f "$PAYLOAD" "$EVENTKIT_OUT"' EXIT

# AppleScript "whose flagged" times out on iCloud lists. EventKit returns the
# open items; the flag itself is read from the local Reminders store below.
"$BIN" "$POOL" > "$EVENTKIT_OUT"

python3 - "$EVENTKIT_OUT" "$PAYLOAD" <<'PY'
import json
import sqlite3
import sys
from pathlib import Path

def flagged_ids():
    root = Path.home() / "Library/Group Containers/group.com.apple.reminders/Container_v1/Stores"
    if not root.is_dir():
        return None
    found = set()
    for path in root.glob("Data-*.sqlite"):
        try:
            con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        except sqlite3.Error:
            continue
        try:
            rows = con.execute(
                """
                SELECT ZDACALENDARITEMUNIQUEIDENTIFIER
                FROM ZREMCDREMINDER
                WHERE ZFLAGGED=1
                  AND (ZCOMPLETED IS NULL OR ZCOMPLETED=0)
                  AND (ZMARKEDFORDELETION IS NULL OR ZMARKEDFORDELETION=0)
                  AND ZDACALENDARITEMUNIQUEIDENTIFIER IS NOT NULL
                """
            )
            found.update(row[0] for row in rows if row[0])
        except sqlite3.Error:
            continue
        finally:
            con.close()
    return found

raw = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not raw.get("ok"):
    print(raw.get("error", "EventKit fetch fallito"), file=sys.stderr)
    sys.exit(1)

def as_bool(value) -> bool:
    if value is True or value == 1:
        return True
    if isinstance(value, str) and value.strip().lower() in {"true", "1", "yes", "sì", "si"}:
        return True
    return False

items = [
    {
        "id": r.get("id") or "",
        "title": r.get("title") or "",
        "listName": r.get("listName") or "Promemoria",
        "dueAt": r.get("dueAt"),
        "notes": r.get("notes") or "",
        "priority": r.get("priority") or "none",
        "flagged": as_bool(r.get("flagged")),
    }
    for r in raw.get("items", [])
    if (r.get("title") or "").strip()
]

flags = flagged_ids()
if flags is None:
    print("Archivio Promemoria illeggibile: non sostituisco i contrassegnati.", file=sys.stderr)
    sys.exit(1)
for item in items:
    item["flagged"] = item["id"] in flags
flagged_count = sum(1 for item in items if item["flagged"])

Path(sys.argv[2]).write_text(
    json.dumps({"device": "Mac", "reminders": items}), encoding="utf-8"
)
print(f"{len(items)} promemoria aperti, {flagged_count} contrassegnati", file=sys.stderr)
PY

# curl --config - keeps the token out of the process list.
# Up to 3 attempts on flaky network / cold Fly (same policy as iPhone Shortcut v3).
printf 'header = "X-Ingest-Token: %s"\n' "$TOKEN" |
  curl --config - \
    --silent --show-error --fail-with-body --max-time 240 \
    --retry 3 --retry-delay 20 --retry-all-errors \
    -X POST "$URL" \
    -H 'Content-Type: application/json' \
    --data-binary "@$PAYLOAD"
echo
