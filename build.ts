// Build JobTrail.app into ~/Applications and start it at login. Run: bun build.ts   (add --no-login to skip the login items)
import { $ } from "bun";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const root = import.meta.dir;
const B = join(root, "build");
const APP = join(homedir(), "Applications/JobTrail.app");
rmSync(B, { recursive: true, force: true });
mkdirSync(join(B, "icon.iconset"), { recursive: true });

await $`swiftc -O -o ${B}/JobTrail ${root}/app/main.swift -framework Cocoa -framework WebKit`;
await $`swiftc -o ${B}/mkicon ${root}/app/icon.swift -framework AppKit`;
await $`${B}/mkicon ${B}/icon.png`;
// phone / Home Screen icons: full-bleed and opaque, or iOS adds a white border
await $`${B}/mkicon ${B}/icon-full.png full`;
await $`sips -s format jpeg -s formatOptions best ${B}/icon-full.png --out ${B}/icon-full.jpg`.quiet(); // drops the alpha channel
await $`sips -s format png -Z 180 ${B}/icon-full.jpg --out ${root}/public/apple-touch-icon.png`.quiet();
await $`sips -s format png -Z 512 ${B}/icon-full.jpg --out ${root}/public/icon-512.png`.quiet();
for (const s of [16, 32, 128, 256, 512]) {
  await $`sips -z ${s} ${s} ${B}/icon.png --out ${B}/icon.iconset/icon_${s}x${s}.png`.quiet();
  await $`sips -z ${s * 2} ${s * 2} ${B}/icon.png --out ${B}/icon.iconset/icon_${s}x${s}@2x.png`.quiet();
}
await $`iconutil -c icns ${B}/icon.iconset -o ${B}/AppIcon.icns`;
await $`osascript -e ${'quit app "JobTrail"'}`.nothrow().quiet();

rmSync(APP, { recursive: true, force: true });
mkdirSync(join(APP, "Contents/MacOS"), { recursive: true });
mkdirSync(join(APP, "Contents/Resources/jobtrail"), { recursive: true });
cpSync(join(B, "JobTrail"), join(APP, "Contents/MacOS/JobTrail"));
cpSync(join(B, "AppIcon.icns"), join(APP, "Contents/Resources/AppIcon.icns"));
cpSync(join(root, "server.ts"), join(APP, "Contents/Resources/jobtrail/server.ts"));
cpSync(join(root, "demo.ts"), join(APP, "Contents/Resources/jobtrail/demo.ts"));
cpSync(join(root, "public"), join(APP, "Contents/Resources/jobtrail/public"), { recursive: true });
writeFileSync(join(APP, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>JobTrail</string>
<key>CFBundleDisplayName</key><string>JobTrail</string>
<key>CFBundleIdentifier</key><string>local.jobtrail.app</string>
<key>CFBundleExecutable</key><string>JobTrail</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
`);
await $`codesign --force --deep -s - ${APP}`.nothrow().quiet();

if (process.argv.includes("--no-login")) { console.log(`built ${APP} (no login items)`); process.exit(0); }
// Start at login: the recorder (server) always runs so history is kept while the window is closed,
// and the window opens at login. Both are plain user LaunchAgents.
const LA = join(homedir(), "Library/LaunchAgents"), uid = process.getuid!();
const RES = join(APP, "Contents/Resources/jobtrail");
const plist = (label: string, args: string[], extra: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map((a) => `<string>${a}</string>`).join("")}</array>
<key>RunAtLoad</key><true/>
${extra}
</dict></plist>
`;
mkdirSync(LA, { recursive: true });
const SRV = "local.jobtrail.server", OPEN = "local.jobtrail.open";
writeFileSync(join(LA, `${SRV}.plist`), plist(SRV, [join(homedir(), ".bun/bin/bun"), join(RES, "server.ts")], `<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${homedir()}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string><key>JOBTRAIL_PORT</key><string>4791</string></dict>
<key>StandardOutPath</key><string>${homedir()}/.jobtrail/server.log</string>
<key>StandardErrorPath</key><string>${homedir()}/.jobtrail/server.log</string>`));
writeFileSync(join(LA, `${OPEN}.plist`), plist(OPEN, ["/usr/bin/open", "-g", APP], ""));
// (re)load the recorder now so the new server.ts runs; the window agent only matters at login
await $`launchctl bootout gui/${uid}/${SRV}`.nothrow().quiet();
await Bun.sleep(500);
await $`launchctl bootstrap gui/${uid} ${join(LA, `${SRV}.plist`)}`.nothrow();
await $`touch ${APP}`;
console.log(`built ${APP}`);
