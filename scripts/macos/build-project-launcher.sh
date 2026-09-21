#!/usr/bin/env bash
# Build "The Daily Tailor.app" in the project root (double-click to open the web app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/The Daily Tailor.app"
MACOS_DIR="$APP/Contents/MacOS"
RES_DIR="$APP/Contents/Resources"
ICONSET="$ROOT/.cache/tdt-iconset"
SRC_PNG="$ROOT/public/icon-512.png"

cleanup() { rm -rf "$ICONSET"; }
trap cleanup EXIT
rm -rf "$ICONSET"

rm -rf "$APP"
mkdir -p "$MACOS_DIR" "$RES_DIR"

cat > "$MACOS_DIR/launch" <<'WRAP'
#!/bin/bash
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec "$ROOT/scripts/macos/launch-web-app.sh"
WRAP
chmod +x "$MACOS_DIR/launch"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.alessandro.the-daily-tailor.launcher</string>
  <key>CFBundleName</key>
  <string>The Daily Tailor</string>
  <key>CFBundleDisplayName</key>
  <string>The Daily Tailor</string>
  <key>CFBundleExecutable</key>
  <string>launch</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
PLIST

ICONSET_DIR="$ICONSET/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"
sips -z 16 16 "$SRC_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SRC_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SRC_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SRC_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SRC_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SRC_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SRC_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SRC_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
iconutil -c icns -o "$RES_DIR/AppIcon.icns" "$ICONSET_DIR"

# PkgInfo marks this as a real application bundle in Finder.
printf 'APPL????' > "$APP/Contents/PkgInfo"

codesign --force --deep --sign - "$APP" 2>/dev/null || true

echo "Built: $APP"
