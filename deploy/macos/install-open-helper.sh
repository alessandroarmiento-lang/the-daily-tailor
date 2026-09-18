#!/usr/bin/env bash
# Install the local Mac opener as an .app + keep it running in the user session.
# EventKit TCC does not work for LaunchAgent-spawned processes; we start the
# server with nohup from this interactive install and register a Login Item.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_SWIFT="$ROOT/scripts/macos/tdt-open.swift"
APP_SUPPORT="$HOME/Library/Application Support/the-daily-tailor"
APP="$APP_SUPPORT/TDT Open.app"
MACOS_DIR="$APP/Contents/MacOS"
OPEN_BIN="$MACOS_DIR/tdt-open"
LOG_DIR="$HOME/Library/Logs/the-daily-tailor"
PLIST_DST="$HOME/Library/LaunchAgents/com.alessandro.the-daily-tailor.open.plist"

mkdir -p "$MACOS_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.alessandro.the-daily-tailor.open</string>
  <key>CFBundleName</key>
  <string>TDT Open</string>
  <key>CFBundleDisplayName</key>
  <string>TDT Open</string>
  <key>CFBundleExecutable</key>
  <string>tdt-open</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSRemindersUsageDescription</key>
  <string>The Daily Tailor apre il promemoria esatto quando clicchi sul giornale.</string>
  <key>NSRemindersFullAccessUsageDescription</key>
  <string>The Daily Tailor apre il promemoria esatto quando clicchi sul giornale.</string>
  <key>NSCalendarsUsageDescription</key>
  <string>The Daily Tailor apre l’evento esatto quando clicchi sul giornale.</string>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>The Daily Tailor apre l’evento esatto quando clicchi sul giornale.</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST

echo "Compiling…"
swiftc -O -o "$OPEN_BIN" "$SRC_SWIFT" \
  -framework EventKit -framework AppKit -framework Network
chmod +x "$OPEN_BIN"
codesign --force --deep --sign - "$APP" 2>/dev/null || true

echo "EventKit auth (Consenti Promemoria/Calendario for TDT Open if asked)…"
"$OPEN_BIN" reminder --title "Autolettura gas" --list "Famiglia" || true
"$OPEN_BIN" event --title "Raccolta alimentare" --start "2026-09-19T06:30:00.000Z" || true

# Stop any prior server
launchctl bootout "gui/$(id -u)/com.alessandro.the-daily-tailor.open" 2>/dev/null || true
pkill -f 'TDT Open.app/Contents/MacOS/tdt-open' 2>/dev/null || true
pkill -f 'tdt-open serve' 2>/dev/null || true
sleep 0.5

# User-session server (EventKit works here; LaunchAgent does not).
nohup "$OPEN_BIN" serve >>"$LOG_DIR/open.out.log" 2>>"$LOG_DIR/open.err.log" &
echo $! >"$APP_SUPPORT/tdt-open.pid"
sleep 1

# Login Item so it comes back after reboot (opens the .app → serve).
osascript <<APPLESCRIPT || true
tell application "System Events"
  if not (exists login item "TDT Open") then
    make login item at end with properties {path:"$APP", hidden:true}
  end if
end tell
APPLESCRIPT

# Keep a LaunchAgent that only restarts the user-session binary if it died
# (same binary path; if EventKit fails from launchd, Login Item is the source of truth).
cat > "$PLIST_DST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.alessandro.the-daily-tailor.open</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>pgrep -f 'TDT Open.app/Contents/MacOS/tdt-open' >/dev/null || nohup '$OPEN_BIN' serve &gt;&gt;'$LOG_DIR/open.out.log' 2&gt;&gt;'$LOG_DIR/open.err.log' &amp;</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>120</integer>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || launchctl load -w "$PLIST_DST" 2>/dev/null || true

if curl -fsS -m 3 "http://127.0.0.1:3855/health" >/dev/null; then
  echo "tdt-open OK on http://127.0.0.1:3855"
else
  echo "Server not up — check $LOG_DIR/open.err.log"
  exit 1
fi

echo "Smoke…"
curl -fsS -m 20 -X POST "http://127.0.0.1:3855/open" \
  -H "Content-Type: application/json" \
  -d '{"kind":"reminder","title":"Autolettura gas","listName":"Famiglia"}'
echo
curl -fsS -m 10 -X POST "http://127.0.0.1:3855/open" \
  -H "Content-Type: application/json" \
  -d '{"kind":"mail","messageId":"1344372135.69527999.1789644981826@email.apple.com"}'
echo
echo "Done. Keep «TDT Open» allowed in Privacy → Reminders / Calendars."
