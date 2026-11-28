// JobTrail Terrain screen saver: 3D ridgelines of the last days of JobTrail jobs (terrain.html).
// on the locked screen.
import ScreenSaver
import WebKit

@objc(JobTrailTerrainView)
final class JobTrailTerrainView: ScreenSaverView, WKNavigationDelegate {
    private var web: WKWebView?
    override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        wantsLayer = true; layer?.backgroundColor = NSColor.black.cgColor
        let w = WKWebView(frame: bounds, configuration: WKWebViewConfiguration())
        w.autoresizingMask = [.width, .height]
        w.setValue(false, forKey: "drawsBackground")
        // the screen saver host (and the Settings preview) never counts as a visible window, so WebKit would suspend
        // drawing; switch its occlusion check off so the page keeps animating
        let occ = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
        if w.responds(to: occ), let imp = w.method(for: occ) {
            typealias SetBool = @convention(c) (AnyObject, Selector, Bool) -> Void
            unsafeBitCast(imp, to: SetBool.self)(w, occ, false)
        }
        if let url = Bundle(for: JobTrailTerrainView.self).url(forResource: "terrain", withExtension: "html") {
            w.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        w.navigationDelegate = self
        addSubview(w); web = w
        timer = Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in self?.poll() }
    }
    // fetch as soon as the page is ready, then every 5 minutes
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { poll() }
    private var timer: Timer?
    deinit { timer?.invalidate() }
    private func poll() {
        guard let u = URL(string: "http://127.0.0.1:4791/api/history?days=30") else { return }
        URLSession.shared.dataTask(with: u) { [weak self] d, _, _ in
            guard let d = d else { return }
            let js = "window.jtHistory64 && jtHistory64('\(d.base64EncodedString())')"
            DispatchQueue.main.async { self?.web?.evaluateJavaScript(js, completionHandler: nil) }
        }.resume()
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }
    override var hasConfigureSheet: Bool { false }
    override func animateOneFrame() {}
}
