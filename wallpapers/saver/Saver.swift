// JobTrail screen saver: plays lock.html (the animated outline drawing) full screen. Shows when the Mac idles and
// on the locked screen.
import ScreenSaver
import WebKit

@objc(JobTrailSaverView)
final class JobTrailSaverView: ScreenSaverView {
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
        if let url = Bundle(for: JobTrailSaverView.self).url(forResource: "lock", withExtension: "html") {
            w.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        addSubview(w); web = w
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.poll() }
    }
    private var timer: Timer?
    deinit { timer?.invalidate() }
    private func poll() {
        guard let u = URL(string: "http://127.0.0.1:4791/api/state") else { return }
        URLSession.shared.dataTask(with: u) { [weak self] d, _, _ in
            guard let d = d else { return }
            let js = "window.jtState64 && jtState64('\(d.base64EncodedString())')"
            DispatchQueue.main.async { self?.web?.evaluateJavaScript(js, completionHandler: nil) }
        }.resume()
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }
    override var hasConfigureSheet: Bool { false }
    override func animateOneFrame() {}
}
