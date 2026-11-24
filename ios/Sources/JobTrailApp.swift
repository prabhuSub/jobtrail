// JobTrail for iPhone: your Mac's live JobTrail page, reached over Tailscale or the local network.
// The key and hosts come from Info.plist (written by build-ios.ts from ~/.jobtrail/token).
import SwiftUI
import WebKit

@main
struct JobTrailApp: App {
  var body: some Scene { WindowGroup { RootView().preferredColorScheme(.dark) } }
}

enum Config {
  static let key = Bundle.main.object(forInfoDictionaryKey: "JTKey") as? String ?? ""
  static let hosts = (Bundle.main.object(forInfoDictionaryKey: "JTHosts") as? String ?? "").split(separator: ",").map(String.init)
  static let port = 4791
}

@MainActor final class Model: ObservableObject {
  @Published var base: URL?
  @Published var status = "Connecting to your Mac…"
  @Published var failed = false
  @Published var reloadToken = 0
  var loadedAt = Date.distantPast

  // first host that answers /health wins
  func connect() async {
    failed = false; status = "Connecting to your Mac…"
    for h in Config.hosts {
      guard let u = URL(string: "http://\(h):\(Config.port)/health") else { continue }
      var req = URLRequest(url: u); req.timeoutInterval = 3
      if let (_, r) = try? await URLSession.shared.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200 {
        base = URL(string: "http://\(h):\(Config.port)/?k=\(Config.key)"); reloadToken += 1; loadedAt = Date(); return
      }
    }
    failed = true
    status = "Can't reach your Mac.\nIs it awake, and is Tailscale on (here and on the Mac)?"
  }
}

struct RootView: View {
  @StateObject var m = Model()
  @Environment(\.scenePhase) var phase
  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      if let b = m.base, !m.failed {
        WebView(url: b, reloadToken: m.reloadToken, onFail: { Task { await m.connect() } }).ignoresSafeArea()
      } else {
        VStack(spacing: 18) {
          Text("JobTrail").font(.system(size: 22, weight: .semibold))
          Text(m.status).font(.system(size: 14)).foregroundStyle(.secondary).multilineTextAlignment(.center)
          if m.failed { Button("Try again") { Task { await m.connect() } }.buttonStyle(.bordered).tint(.orange) }
          else { ProgressView().tint(.orange) }
        }.padding(32)
      }
    }
    .task { await m.connect() }
    .onChange(of: phase) { _, p in
      // the live stream stops while the app is in the background: reconnect when it comes back
      if p == .active && Date().timeIntervalSince(m.loadedAt) > 20 { Task { await m.connect() } }
    }
  }
}

struct WebView: UIViewRepresentable {
  let url: URL; let reloadToken: Int; let onFail: () -> Void
  func makeCoordinator() -> Coord { Coord(onFail: onFail) }
  func makeUIView(context: Context) -> WKWebView {
    let cfg = WKWebViewConfiguration()
    cfg.allowsInlineMediaPlayback = true
    cfg.mediaTypesRequiringUserActionForPlayback = []
    let w = WKWebView(frame: .zero, configuration: cfg)
    w.isOpaque = false; w.backgroundColor = .black; w.scrollView.backgroundColor = .black
    w.scrollView.contentInsetAdjustmentBehavior = .never
    w.allowsBackForwardNavigationGestures = false
    w.navigationDelegate = context.coordinator
    let rc = UIRefreshControl(); rc.tintColor = .orange
    rc.addAction(UIAction { _ in w.reload(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { rc.endRefreshing() } }, for: .valueChanged)
    w.scrollView.refreshControl = rc
    w.load(URLRequest(url: url))
    context.coordinator.token = reloadToken
    return w
  }
  func updateUIView(_ w: WKWebView, context: Context) {
    if context.coordinator.token != reloadToken { context.coordinator.token = reloadToken; w.load(URLRequest(url: url)) }
  }
  final class Coord: NSObject, WKNavigationDelegate {
    var token = 0; let onFail: () -> Void
    init(onFail: @escaping () -> Void) { self.onFail = onFail }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { onFail() }
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }
  }
}
