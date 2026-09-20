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
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>com.alessandro.the-daily-tailor.open</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>tdt-open</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST

echo "Compiling…"
swiftc -O -o "$OPEN_BIN.real" "$SRC_SWIFT" \
  -framework EventKit -framework AppKit -framework Network
cat > "$OPEN_BIN" <<WRAP
#!/bin/bash
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
LOG_DIR="$LOG_DIR"
mkdir -p "\$LOG_DIR"
exec "\$DIR/tdt-open.real" serve >>"\$LOG_DIR/open.out.log" 2>>"\$LOG_DIR/open.err.log"
WRAP
chmod +x "$OPEN_BIN" "$OPEN_BIN.real"
# CLI entrypoint for install smoke (reminder/event/mail without serve wrapper)
CLI_BIN="$MACOS_DIR/tdt-open-cli"
cp "$OPEN_BIN.real" "$CLI_BIN"
chmod +x "$CLI_BIN"
codesign --force --deep --sign - "$APP" 2>/dev/null || true
# Refresh Launch Services so tdt-open:// resolves to this .app
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [[ -x "$LSREG" ]]; then
  "$LSREG" -f "$APP" 2>/dev/null || true
fi

echo "EventKit auth (Consenti Promemoria/Calendario for TDT Open if asked)…"
"$CLI_BIN" reminder --title "Autolettura gas" --list "Famiglia" || true
"$CLI_BIN" event --title "Raccolta alimentare" --start "2026-09-19T06:30:00.000Z" || true

# Stop any prior server
launchctl bootout "gui/$(id -u)/com.alessandro.the-daily-tailor.open" 2>/dev/null || true
pkill -f 'TDT Open.app/Contents/MacOS/tdt-open' 2>/dev/null || true
pkill -f 'tdt-open serve' 2>/dev/null || true
sleep 0.5

# Launch via LaunchServices so the process survives the install shell
# (nohup from Cursor/agent shells is still killed with the session).
open -g -a "$APP"
sleep 1.5

# Login Item so it comes back after reboot.
osascript <<APPLESCRIPT || true
tell application "System Events"
  if not (exists login item "TDT Open") then
    make login item at end with properties {path:"$APP", hidden:true}
  end if
end tell
APPLESCRIPT

# Watchdog: relaunch via open if the binary died (gui session, not launchd exec).
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
    <string>pgrep -f 'TDT Open.app/Contents/MacOS/tdt-open' >/dev/null || open -g -a '$APP'</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>60</integer>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || launchctl load -w "$PLIST_DST" 2>/dev/null || true

# Wait for listen (open is async)
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS -m 2 "http://127.0.0.1:3855/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if curl -fsS -m 3 "http://127.0.0.1:3855/health" >/dev/null; then
  echo "tdt-open OK on http://127.0.0.1:3855"
else
  echo "Server not up — check $LOG_DIR/open.err.log"
  # Last resort: start detached from a background login-shell job
  /bin/bash -lc "nohup '$OPEN_BIN' serve >>'$LOG_DIR/open.out.log' 2>>'$LOG_DIR/open.err.log' &" &
  sleep 1.5
  if ! curl -fsS -m 3 "http://127.0.0.1:3855/health" >/dev/null; then
    exit 1
  fi
  echo "tdt-open OK (bash -lc fallback)"
fi

echo "Smoke…"
curl -fsS -m 20 -X POST "http://127.0.0.1:3855/open" \
  -H "Content-Type: application/json" \
  -d '{"kind":"reminder","title":"Autolettura gas","listName":"Famiglia"}' || true
echo
curl -fsS -m 10 -X POST "http://127.0.0.1:3855/open" \
  -H "Content-Type: application/json" \
  -d '{"kind":"mail","messageId":"1344372135.69527999.1789644981826@email.apple.com"}' || true
echo
curl -fsS -m 45 -X POST "http://127.0.0.1:3855/open" \
  -H "Content-Type: application/json" \
  -d '{"kind":"mail","title":"Spedizione da ritirare"}' || true
echo
echo "Done. Keep «TDT Open» allowed in Privacy → Reminders / Calendars / Automation (Reminders + System Events + Mail)."
echo "Scheme check: open 'tdt-open://open?kind=reminder&title=Autolettura%20gas&listName=Famiglia'"
pgrep -lf 'tdt-open.real' || pgrep -lf 'TDT Open.app' || true