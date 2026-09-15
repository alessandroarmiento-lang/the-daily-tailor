#!/usr/bin/env bash
# One-shot helper: prompt macOS Automation / TCC for Mail, Calendar, Reminders, Contacts.
# Also prints IMAP/CalDAV setup needed for Mac-off edition generation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== The Daily Tailor — Apple access ==="
echo "Repo: $ROOT"
echo

echo "1) Automation prompts (Mac awake only)"
echo "   System Settings → Privacy & Security → Automation"
echo "   Allow Terminal / Cursor / node to control Mail, Calendar, Reminders, Contacts."
echo

prompt_app() {
  local app="$1"
  local script="$2"
  echo "— Probing $app …"
  if /usr/bin/osascript "$ROOT/scripts/macos/$script" 1 2>/tmp/dt-grant-err.txt; then
    echo "  OK: $app responded"
  else
    echo "  BLOCKED or failed: $app"
    head -c 240 /tmp/dt-grant-err.txt 2>/dev/null || true
    echo
    echo "  → Open System Settings → Privacy & Security → Automation"
    echo "    and enable control of $app for this terminal/IDE."
  fi
  echo
}

prompt_app "Calendar" "fetch-calendar.applescript"
prompt_app "Reminders" "fetch-reminders.applescript"
prompt_app "Mail" "fetch-action-emails.applescript"

echo "— Contacts (optional, for people-filter)"
if /usr/bin/osascript -e 'tell application "Contacts" to count of people' >/dev/null 2>/tmp/dt-grant-err.txt; then
  echo "  OK: Contacts responded"
else
  echo "  BLOCKED or failed: Contacts"
  head -c 200 /tmp/dt-grant-err.txt 2>/dev/null || true
fi
echo

echo "2) Mail accounts currently in Mail.app:"
/usr/bin/osascript -e 'tell application "Mail" to get name of every account' 2>/dev/null || echo "  (unavailable — authorize Mail)"
echo

echo "3) Mac-OFF generation (required for editions when Mac is powered off)"
echo "   Copy .env.example → .env.local and set app-specific passwords:"
echo "   - ICLOUD_MAIL_USER + ICLOUD_MAIL_APP_PASSWORD   (imap.mail.me.com)"
echo "   - GMAIL_USER + GMAIL_APP_PASSWORD               (imap.gmail.com)"
echo "   - Same Apple ID password also drives CalDAV/CardDAV for Calendar,"
echo "     Reminders (VTODO), and Contacts match."
echo "   Create passwords at appleid.apple.com and myaccount.google.com (App passwords)."
echo
echo "   With those set, ACTION_EMAIL_SOURCE/CALENDAR_SOURCE/REMINDERS_SOURCE=auto"
echo "   will prefer IMAP/CalDAV (headless) over Mail.app/EventKit."
echo
echo "Done."
