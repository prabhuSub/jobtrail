#!/bin/zsh
# Builds ~/Applications/JobTrail Wallpaper.app from main.swift + ../desktop.html
set -e
cd "$(dirname "$0")"
APP="$HOME/Applications/JobTrail Wallpaper.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O main.swift -o "$APP/Contents/MacOS/JobTrailWallpaper"
cp ../blueprint.js "$APP/Contents/Resources/"
# cache-bust: a new ?v= on every build so WebKit never serves an old blueprint.js
sed "s#blueprint.js\"#blueprint.js?v=$(date +%s)\"#" ../desktop.html > "$APP/Contents/Resources/desktop.html"
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.jobtrail.wallpaper</string>
<key>CFBundleName</key><string>JobTrail Wallpaper</string>
<key>CFBundleExecutable</key><string>JobTrailWallpaper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSUIElement</key><true/>
<key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PL
codesign --force -s - "$APP" >/dev/null 2>&1 || true
echo "built $APP"
