// JobTrail Wallpaper: shows desktop.html as a moving wallpaper. One borderless window per screen at desktop level
// (behind icons and windows), on every Space, ignoring the mouse. No Dock icon (LSUIElement).
import AppKit
import WebKit

final class App: NSObject, NSApplicationDelegate {
    var windows: [NSWindow] = []
    var webs: [WKWebView] = []
    func applicationDidFinishLaunching(_ n: Notification) {
        build()
        // live data for the telemetry panels: JobTrail's local snapshot, passed in as base64 JSON every 3 s
        Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.poll() }
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in self?.pollHistory() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.pollHistory() }
        NotificationCenter.default.addObserver(self, selector: #selector(build), name: NSApplication.didChangeScreenParametersNotification, object: nil)
    }
    // job history for the terrain floor, every 5 minutes
    func pollHistory() {
        guard let u = URL(string: "http://127.0.0.1:4791/api/history?days=30") else { return }
        URLSession.shared.dataTask(with: u) { [weak self] d, _, _ in
            guard let d = d else { return }
            let js = "window.jtHistory64 && jtHistory64('\(d.base64EncodedString())')"
            DispatchQueue.main.async { self?.webs.forEach { $0.evaluateJavaScript(js, completionHandler: nil) } }
        }.resume()
    }
    func poll() {
        guard let u = URL(string: "http://127.0.0.1:4791/api/state") else { return }
        URLSession.shared.dataTask(with: u) { [weak self] d, _, _ in
            guard let d = d else { return }
            let js = "window.jtState64 && jtState64('\(d.base64EncodedString())')"
            DispatchQueue.main.async { self?.webs.forEach { $0.evaluateJavaScript(js, completionHandler: nil) } }
        }.resume()
    }
    @objc func build() {
        windows.forEach { $0.orderOut(nil) }; windows = []; webs = []
        guard let url = Bundle.main.url(forResource: "desktop", withExtension: "html") else { return }
        for screen in NSScreen.screens {
            let w = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false, screen: screen)
            w.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
            w.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            w.ignoresMouseEvents = true
            w.backgroundColor = .black
            w.isReleasedWhenClosed = false
            let cfg = WKWebViewConfiguration()
            cfg.suppressesIncrementalRendering = true
            let web = WKWebView(frame: NSRect(origin: .zero, size: screen.frame.size), configuration: cfg)
            web.setValue(false, forKey: "drawsBackground")
            web.autoresizingMask = [.width, .height]
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            w.contentView = web; webs.append(web)
            w.setFrame(screen.frame, display: true)
            w.orderFront(nil)
            windows.append(w)
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.pollHistory() }
        }
    }
}
let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
