#!/bin/zsh
# Builds ~/Library/Screen Savers/JobTrail.saver from Saver.swift + ../lock.html
set -e
cd "$(dirname "$0")"
S="$HOME/Library/Screen Savers/JobTrail.saver"
rm -rf "$S"; mkdir -p "$S/Contents/MacOS" "$S/Contents/Resources"
swiftc -O -module-name JobTrailSaver -emit-library -Xlinker -bundle -o "$S/Contents/MacOS/JobTrailSaver" Saver.swift -framework ScreenSaver -framework WebKit
cp ../lock.html ../blueprint.js "$S/Contents/Resources/"
cat > "$S/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.jobtrail.saver</string>
<key>CFBundleName</key><string>JobTrail</string>
<key>CFBundleExecutable</key><string>JobTrailSaver</string>
<key>CFBundlePackageType</key><string>BNDL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>NSPrincipalClass</key><string>JobTrailSaverView</string>
</dict></plist>
PL
codesign --force -s - "$S" >/dev/null 2>&1 || true
echo "built $S"
