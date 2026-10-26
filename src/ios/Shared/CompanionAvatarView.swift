//
//  CompanionAvatarView.swift
//  Minis - Companion Mascot Avatar View
//

import SwiftUI
import WebKit
import UIKit

public struct CompanionAvatarView: UIViewRepresentable {
    public let state: String
    public let size: CGFloat
    public let interactive: Bool
    
    public init(state: String = "idle", size: CGFloat = 36, interactive: Bool = false) {
        self.state = state
        self.size = size
        self.interactive = interactive
    }
    
    public func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    public func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // [CompanionHotReload] 非持久化数据仓：吉祥物不写任何 storage，
        // 但持久化仓会把旧的 minis-companion.js 留在磁盘缓存里，热更后
        // 仍可能命中老脚本。内存仓让每次导航都回源到磁盘。
        configuration.websiteDataStore = .nonPersistent()
        
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: size, height: size), configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isUserInteractionEnabled = interactive
        
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        
        context.coordinator.webView = webView
        webView.navigationDelegate = context.coordinator
        // [CompanionHotReload] 解析顺序：MinisFileProvider/shared/companion →
        // Bundle.main；读权限按来源区分，见 CompanionHotReload.resolveHost()。
        context.coordinator.loadHost(into: webView)
        context.coordinator.startObservingHotReload()
        
        return webView
    }
    
    public func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.currentState != state {
            context.coordinator.currentState = state
            let escapedState = state.replacingOccurrences(of: "'", with: "\\'")
            let js = "window.setCompanionState && window.setCompanionState('\(escapedState)');"
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
    
    public class Coordinator: NSObject, WKNavigationDelegate {
        var parent: CompanionAvatarView
        weak var webView: WKWebView?
        var currentState: String = ""
        
        /// [CompanionHotReload] 热更广播的订阅句柄；视图销毁时一并摘掉。
        private var hotReloadObserver: NSObjectProtocol?
        /// 当前加载的是否是外部热更目录（仅用于日志定位）。
        private(set) var isLiveHost = false

        init(_ parent: CompanionAvatarView) {
            self.parent = parent
            self.currentState = parent.state
        }
        
        deinit {
            if let hotReloadObserver {
                NotificationCenter.default.removeObserver(hotReloadObserver)
            }
        }

        /// 加载宿主页面：外部热更目录命中则用该目录（读权限也给它），
        /// 否则回退 Bundle 内置资源（读权限给资源所在父目录）。
        func loadHost(into webView: WKWebView) {
            guard let host = CompanionHotReload.resolveHost() else {
                NSLog("[CompanionHotReload] companion-host.html not found (live + bundle)")
                return
            }
            isLiveHost = host.isLive
            NSLog("[CompanionHotReload] load \(host.isLive ? "LIVE" : "BUNDLE") \(host.url.path)")
            webView.loadFileURL(host.url, allowingReadAccessTo: host.readAccessURL)
        }

        /// 订阅「磁盘资源变了」，变化后重新导航即可拿到新 HTML/JS；
        /// 导航结束后 didFinish 会按 currentState 重新对齐状态机。
        func startObservingHotReload() {
            guard hotReloadObserver == nil else { return }
            CompanionHotReloadWatcher.shared.start()
            hotReloadObserver = NotificationCenter.default.addObserver(
                forName: CompanionHotReload.reloadNotification,
                object: nil,
                queue: .main
            ) { [weak self, weak webView] _ in
                guard let self, let webView else { return }
                self.loadHost(into: webView)
            }
        }

        public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            let escapedState = currentState.replacingOccurrences(of: "'", with: "\\'")
            let js = "window.setCompanionState && window.setCompanionState('\(escapedState)');"
            webView.evaluateJavaScript(js, completionHandler: nil)
            // [CompanionHotReload] 回读脚本自报的版本标签：真机日志里能直接看到
            // 「此刻跑的是哪一版 minis-companion.js」，热更是否生效一目了然。
            webView.evaluateJavaScript("window.__MINIS_COMPANION_BUILD__ || 'unknown'") { value, _ in
                let tag = (value as? String) ?? "unknown"
                NSLog("[CompanionHotReload] host ready build=%@ live=%@", tag, self.isLiveHost ? "YES" : "NO")
            }
        }
    }
}
