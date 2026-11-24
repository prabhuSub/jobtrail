// Build JobTrail for iPhone and install it on a paired iPhone.
// Run: JOBTRAIL_TEAM_ID=<your Apple team id> bun build-ios.ts   (optional JOBTRAIL_BUNDLE_ID)
// Needs Xcode, xcodegen and a free or paid Apple developer account. The Home Screen web app needs none of this.
// The app shows your Mac's JobTrail over Tailscale (or the local network); the access key comes from ~/.jobtrail/token.
import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const root = import.meta.dir, ios = join(root, "ios"), B = join(root, "build-ios");
const key = readFileSync(join(homedir(), ".jobtrail/token"), "utf8").trim();
const ts = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
const tsIP = existsSync(ts) ? (await $`${ts} ip -4`.nothrow().text()).trim() : "";
// Tailscale only: plain http to the Mac is safe there because Tailscale encrypts the link
const hosts = tsIP;
if (!hosts) throw new Error("Tailscale is not running on this Mac; the phone app connects over Tailscale only.");
const TEAM = process.env.JOBTRAIL_TEAM_ID ?? "";
if (!TEAM) throw new Error("Set JOBTRAIL_TEAM_ID (Xcode → Settings → Accounts, or the OU of your Apple Development certificate).");
const BUNDLE = process.env.JOBTRAIL_BUNDLE_ID ?? `local.jobtrail.${TEAM.toLowerCase()}`;
process.env.JOBTRAIL_BUNDLE_ID = BUNDLE;

writeFileSync(join(ios, "Sources/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleDisplayName</key><string>JobTrail</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleName</key><string>JobTrail</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>UILaunchScreen</key><dict><key>UIColorName</key><string></string></dict>
<key>UIStatusBarStyle</key><string>UIStatusBarStyleLightContent</string>
<key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><true/></dict>
<key>NSLocalNetworkUsageDescription</key><string>JobTrail connects to your Mac to show what your Claude chats are running.</string>
<key>JTKey</key><string>${key}</string>
<key>JTHosts</key><string>${hosts}</string>
</dict></plist>
`);

// icon: same mark as the Mac app
mkdirSync(B, { recursive: true });
await $`swiftc -o ${B}/mkicon ${root}/app/icon.swift -framework AppKit`.quiet();
await $`${B}/mkicon ${B}/icon.png full`.quiet();
await $`sips -s format png -s hasAlpha no ${B}/icon.png --out ${ios}/Sources/Assets.xcassets/AppIcon.appiconset/icon.png`.quiet().nothrow();

await $`cd ${ios} && xcodegen generate --quiet`;
const dev = (await $`xcrun devicectl list devices`.text()).split("\n").find((l) => /physical/.test(l) && /available/.test(l) && /iPhone/.test(l));
const udid = dev?.match(/[0-9A-F]{8}-[0-9A-F]{16}/)?.[0];
if (!udid) throw new Error("No paired iPhone available (unlock it and keep it near / on the same Wi-Fi).");
await $`xcodebuild -project ${ios}/JobTrail.xcodeproj -scheme JobTrail -configuration Release -destination id=${udid} -derivedDataPath ${B}/dd -allowProvisioningUpdates build`.quiet();
const app = join(B, "dd/Build/Products/Release-iphoneos/JobTrail.app");
await $`xcrun devicectl device install app --device ${udid} ${app}`;
await $`xcrun devicectl device process launch --device ${udid} ${BUNDLE}`.nothrow();
console.log(`installed on ${udid}; hosts ${hosts}`);
