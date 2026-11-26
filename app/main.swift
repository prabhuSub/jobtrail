// JobTrail.app: a native window around the local JobTrail server (bun + TypeScript).
// Starts the bundled server on launch, shows it in a WKWebView, stops it on quit.
import Cocoa
import WebKit

let port = 4791
let home = FileManager.default.homeDirectoryForCurrentUser.path

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var server: Process?

  func applicationDidFinishLaunching(_ note: Notification) {
    buildMenu()
    startServer()
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
                      styleMask: [.titled, .closable, .miniaturizable, .resizable],
                      backing: .buffered, defer: false)
    window.title = "JobTrail"
    window.appearance = NSAppearance(named: .darkAqua)
    window.titlebarAppearsTransparent = true
    window.backgroundColor = .black
    window.minSize = NSSize(width: 720, height: 480)
    window.center()
    window.setFrameAutosaveName("JobTrailMain")
    let cfg = WKWebViewConfiguration()
    cfg.mediaTypesRequiringUserActionForPlayback = [] // JobTrail's soft sounds can start without a click
    web = WKWebView(frame: window.contentView!.bounds, configuration: cfg)
    web.autoresizingMask = [.width, .height]
    web.setValue(false, forKey: "drawsBackground")
    web.navigationDelegate = self
    web.uiDelegate = self
    window.contentView!.addSubview(web)
    web.loadHTMLString("<body style='background:#000;color:#686868;font:13px -apple-system;display:grid;place-items:center;height:90vh'>Starting JobTrail…</body>", baseURL: nil)
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    waitAndLoad(tries: 0)
  }

  func startServer() {
    if ping() { return } // already running (e.g. started by hand)
    // normally the login LaunchAgent runs the recorder; just make sure it is up
    let agent = "\(home)/Library/LaunchAgents/local.jobtrail.server.plist"
    if FileManager.default.fileExists(atPath: agent) {
      let k = Process(); k.executableURL = URL(fileURLWithPath: "/bin/launchctl")
      k.arguments = ["kickstart", "gui/\(getuid())/local.jobtrail.server"]
      try? k.run(); return
    }
    guard let res = Bundle.main.resourcePath else { return }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "\(home)/.bun/bin/bun")
    p.arguments = ["\(res)/jobtrail/server.ts"]
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = "\(home)/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    env["JOBTRAIL_PORT"] = String(port)
    p.environment = env
    try? FileManager.default.createDirectory(atPath: "\(home)/.jobtrail", withIntermediateDirectories: true)
    let logPath = "\(home)/.jobtrail/server.log"
    FileManager.default.createFile(atPath: logPath, contents: nil)
    if let fh = FileHandle(forWritingAtPath: logPath) { p.standardOutput = fh; p.standardError = fh }
    do { try p.run(); server = p } catch { NSLog("JobTrail: could not start server: \(error)") }
  }

  func ping() -> Bool {
    guard let url = URL(string: "http://127.0.0.1:\(port)/health") else { return false }
    var ok = false
    let sem = DispatchSemaphore(value: 0)
    var req = URLRequest(url: url); req.timeoutInterval = 0.5
    URLSession.shared.dataTask(with: req) { _, resp, _ in
      ok = (resp as? HTTPURLResponse)?.statusCode == 200; sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 0.8)
    return ok
  }

  func waitAndLoad(tries: Int) {
    DispatchQueue.global().async {
      let up = self.ping()
      DispatchQueue.main.async {
        if up { self.web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/")!)) }
        else if tries < 60 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.waitAndLoad(tries: tries + 1) } }
        else { self.web.loadHTMLString("<body style='background:#000;color:#db6b67;font:13px -apple-system;padding:40px'>JobTrail server did not start. See ~/.jobtrail/server.log</body>", baseURL: nil) }
      }
    }
  }

  // Server restarted or connection dropped: reload.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

  @objc func reloadPage() { web.reload() }

  func buildMenu() {
    let main = NSMenu()
    let appItem = NSMenuItem(); main.addItem(appItem)
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About JobTrail", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide JobTrail", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit JobTrail", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    let editItem = NSMenuItem(); main.addItem(editItem)
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    let viewItem = NSMenuItem(); main.addItem(viewItem)
    let view = NSMenu(title: "View")
    view.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
    viewItem.submenu = view
    let winItem = NSMenuItem(); main.addItem(winItem)
    let win = NSMenu(title: "Window")
    win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    win.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    winItem.submenu = win
    NSApp.mainMenu = main
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
  func applicationWillTerminate(_ note: Notification) { server?.terminate() }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
