#!/usr/bin/env bash
# One-shot: build EventKit tools + prompt TCC + print Mac-off IMAP/CalDAV setup.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== The Daily Tailor — Apple access ==="
echo

echo "1) Build EventKit helpers (Calendar + Reminders without Mail.app Automation)"
chmod +x scripts/macos/build-eventkit-tools.sh
./scripts/macos/build-eventkit-tools.sh || true
echo

echo "2) Privacy prompts"
echo "   System Settings → Privacy & Security → Calendari → abilita Terminal / Cursor / fetch-calendar-eventkit"
echo "   System Settings → Privacy & Security → Promemoria → abilita Terminal / Cursor / fetch-reminders-eventkit"
echo "   System Settings → Privacy & Security → Automazione → Cursor/node → Mail, Calendar (fallback)"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars" 2>/dev/null || true
sleep 1

echo "— Probing EventKit Reminders…"
if scripts/macos/bin/fetch-reminders-eventkit 5 2>/tmp/dt-grant-rem.txt | head -c 200; then
  echo
  echo "  OK Promemoria EventKit"
else
  echo "  BLOCCATO Promemoria — autorizza Privacy → Promemoria"
  cat /tmp/dt-grant-rem.txt 2>/dev/null | head -c 200 || true
fi
echo

echo "— Probing EventKit Calendar…"
CAL_OUT=$(scripts/macos/bin/fetch-calendar-eventkit 4 2>/tmp/dt-grant-cal.txt || true)
echo "$CAL_OUT" | head -c 240; echo
if echo "$CAL_OUT" | grep -q '"ok":true'; then
  echo "  OK Calendario EventKit"
else
  echo "  BLOCCATO Calendario — autorizza Privacy → Calendari, poi rilancia questo script."
fi
echo

echo "3) Mail accounts in Mail.app (Automation):"
/usr/bin/osascript -e 'tell application "Mail" to get name of every account' 2>/dev/null || echo "  (unavailable)"
echo

echo "4) Mac-OFF (.env.local) — generazione a Mac spento:"
echo "   ICLOUD_MAIL_USER=…   ICLOUD_MAIL_APP_PASSWORD=…"
echo "   GMAIL_USER=…         GMAIL_APP_PASSWORD=…"
echo "   (stessa Apple password per CalDAV/CardDAV se vuoi calendar/reminders headless)"
echo
echo "Poi: curl -s 'http://127.0.0.1:3847/api/morning-warm?force=1'"
echo "Done."
