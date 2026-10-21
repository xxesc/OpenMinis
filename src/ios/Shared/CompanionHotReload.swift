import Foundation
import UIKit

/// [Minis Companion Hot-Reload] Build 9
///
/// 吉祥物此前只能从 App Bundle 加载 `companion-host.html`：任何动效 / 配色 /
/// 状态机的微调都要重新出包、签名、直装（≈20 分钟一轮）。这里把资源目录变成
/// 运行时可写的一等公民：
///
/// 1. 优先级：`<container>/MinisFileProvider/shared/companion/`（App 内即
///    `AIChatViewModel.minisSharedPersistentDir/companion`，从 shell 看就是
///    `/var/minis/shared/companion/`，从「文件」App 看是 On My iPhone → Minis
///    → shared → companion）。命中则 WebView 直接从该目录加载；
/// 2. 回退：目录里没有 `companion-host.html` 时无缝回退 `Bundle.main` 内置
///    资源，空目录 / 老安装都不会白屏；
/// 3. `WKWebView.loadFileURL(_:allowingReadAccessTo:)` 的读权限按来源区分：
///    外部目录传目录本身，Bundle 传 `bundlePath.deletingLastPathComponent()`
///    （原来的写法），避免 WebKit 判定越权读取而静默失败；
/// 4. `CompanionHotReloadWatcher` 以 1s 轮询目录指纹（mtime + size），一有
///    变化就广播 `reloadNotification`，所有存活头像当场重新导航 —— 改完 JS
///    无需重启 App、更无需重新编译。
///
/// 采用轮询而非 kqueue：编辑器 / `sed -i` / 原子保存都会换掉 inode，
/// `DispatchSource.makeFileSystemObjectSource` 的 watch 会随之失效，而目录
/// 指纹轮询对「替换文件」这种最常见的写法依然稳定。
enum CompanionHotReload {
    static let hostFileName = "companion-host.html"
    static let scriptFileName = "minis-companion.js"
    static let reloadNotification = Notification.Name("MinisCompanionHotReloadDidChange")
    static let pollInterval: TimeInterval = 1.0

    /// App 级「上次落盘基线」的哈希清单，用来区分「用户手改过的文件」与
    /// 「我们抄进来的原始文件」——只有后者才允许跟随 App 升级覆盖。
    private static let seedMarkerName = ".minis-seed.json"

    /// 一次性解析结果：给 WebView 用的 url 与它需要的读权限根。
    struct HostLocation {
        let url: URL
        let readAccessURL: URL
        let isLive: Bool
    }

    /// 热更目录（按优先级）。`SharedContainerStore.containerURL` 已经做过兜底：
    /// 有 App Group 授权时是 App Group 容器，自签无授权时是
    /// `Documents/MinisData`。这里再显式补上两条历史路径，覆盖授权中途变化、
    /// 或用户在「文件」App 里自行放置过基线的情况。
    static var liveDirectories: [URL] {
        let fm = FileManager.default
        var candidates: [URL] = [
            SharedContainerStore.containerURL
                .appendingPathComponent("MinisFileProvider", isDirectory: true)
                .appendingPathComponent("shared", isDirectory: true)
                .appendingPathComponent("companion", isDirectory: true)
        ]

        if let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first {
            candidates.append(
                docs.appendingPathComponent("MinisData", isDirectory: true)
                    .appendingPathComponent("MinisFileProvider", isDirectory: true)
                    .appendingPathComponent("shared", isDirectory: true)
                    .appendingPathComponent("companion", isDirectory: true)
            )
        }
        // 旧版自签构建的用户目录（SharedContainerStore 迁移前的落点）。
        if let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            candidates.append(
                support.appendingPathComponent("MinisContainer", isDirectory: true)
                    .appendingPathComponent("MinisFileProvider", isDirectory: true)
                    .appendingPathComponent("shared", isDirectory: true)
                    .appendingPathComponent("companion", isDirectory: true)
            )
        }

        var seen = Set<String>()
        return candidates.filter { seen.insert($0.standardizedFileURL.path).inserted }
    }

    static var primaryLiveDirectory: URL {
        liveDirectories[0]
    }

    // MARK: - Resolution

    /// 解析本次要加载的宿主页面。外部目录优先，缺失则回退 Bundle。
    static func resolveHost() -> HostLocation? {
        if let live = firstLiveHost() { return live }

        // 只丢了 js 没丢 html：把内置 html 抄进热更目录，让它以相对路径引用
        // 同目录下这份最新脚本（否则 html 会去加载它自己旁边的旧 js）。
        let fm = FileManager.default
        if liveDirectories.contains(where: {
            fm.fileExists(atPath: $0.appendingPathComponent(scriptFileName).path)
        }) {
            bootstrapIfNeeded()
            if let live = firstLiveHost() { return live }
        }

        guard let bundled = Bundle.main.url(forResource: "companion-host", withExtension: "html") else {
            return nil
        }
        return HostLocation(
            url: bundled,
            readAccessURL: bundled.deletingLastPathComponent(),
            isLive: false
        )
    }

    private static func firstLiveHost() -> HostLocation? {
        let fm = FileManager.default
        for dir in liveDirectories {
            let host = dir.appendingPathComponent(hostFileName)
            guard fm.fileExists(atPath: host.path) else { continue }
            // 读权限给整个目录：HTML 以相对路径引用 minis-companion.js，
            // 只授单文件时脚本会被 WebKit 拒绝加载。
            return HostLocation(url: host, readAccessURL: dir, isLive: true)
        }
        return nil
    }

    // MARK: - Baseline seeding

    /// 保证热更目录里始终有一套完整基线：首次渲染头像时把内置资源抄进去。
    ///
    /// 绝不吃掉用户的手改：只有当磁盘内容与我们上次落盘的哈希完全一致
    /// （即用户从未编辑过）时，才跟随 App 升级覆盖为新内置版本。
    static func bootstrapIfNeeded() {
        guard let bundledHost = Bundle.main.url(forResource: "companion-host", withExtension: "html"),
              let bundledScript = Bundle.main.url(forResource: "minis-companion", withExtension: "js"),
              let hostData = try? Data(contentsOf: bundledHost),
              let scriptData = try? Data(contentsOf: bundledScript) else { return }

        let fm = FileManager.default
        let dir = primaryLiveDirectory
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)

        let markerURL = dir.appendingPathComponent(seedMarkerName)
        var seeded: [String: String] = [:]
        if let data = try? Data(contentsOf: markerURL),
           let decoded = try? JSONDecoder().decode([String: String].self, from: data) {
            seeded = decoded
        }
        var nextSeeded = seeded
        var didWrite = false

        let pairs: [(String, Data)] = [
            (hostFileName, hostData),
            (scriptFileName, scriptData)
        ]

        for (name, sourceData) in pairs {
            let dest = dir.appendingPathComponent(name)
            let sourceHash = fnv1a(sourceData)
            guard let existing = try? Data(contentsOf: dest) else {
                // 原子写入：热更目录随时可能被 WebView 读取，绝不能出现半截文件。
                if (try? sourceData.write(to: dest, options: .atomic)) != nil {
                    nextSeeded[name] = sourceHash
                    didWrite = true
                }
                continue
            }
            let existingHash = fnv1a(existing)
            if seeded[name] == existingHash {
                // 用户没动过 → 允许跟随新内置版本刷新。
                if existingHash != sourceHash,
                   (try? sourceData.write(to: dest, options: .atomic)) != nil {
                    nextSeeded[name] = sourceHash
                    didWrite = true
                }
            } else if nextSeeded[name] == nil {
                // 老目录没有 marker：只登记现状，绝不覆盖用户的文件。
                nextSeeded[name] = existingHash
                didWrite = true
            }
        }

        if didWrite, let data = try? JSONEncoder().encode(nextSeeded) {
            try? data.write(to: markerURL, options: .atomic)
        }
    }

    // MARK: - Change fingerprint

    /// 热更目录的轻量指纹：两个文件的 (mtime, size)。文件不存在时记 `-`，
    /// 因此「新建 / 删除 / 改写」都会改变指纹。
    static func signature() -> String {
        let fm = FileManager.default
        var parts: [String] = []
        for dir in liveDirectories {
            for name in [hostFileName, scriptFileName] {
                let url = dir.appendingPathComponent(name)
                guard let attrs = try? fm.attributesOfItem(atPath: url.path) else {
                    parts.append("-")
                    continue
                }
                let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
                let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
                parts.append("\(Int(mtime)):\(size)")
            }
        }
        return parts.joined(separator: "|")
    }

    /// 64 位 FNV-1a：只用于「文件是否还是我们抄进去的那份」，不需要密码学强度。
    private static func fnv1a(_ data: Data) -> String {
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in data {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01b3
        }
        return String(hash, radix: 16)
    }
}

/// 目录指纹轮询器：全 App 单例，1s 一次，命中变化后广播通知。
/// 只由 `CompanionAvatarView` 启动（首个头像出现时），之后常驻。
final class CompanionHotReloadWatcher {
    static let shared = CompanionHotReloadWatcher()

    private let logger = AppLogger(category: "CompanionHotReload")
    private var timer: Timer?
    private var lastSignature = ""
    private var foregroundObserver: NSObjectProtocol?

    private init() {}

    /// 幂等：重复调用（视图重建 / 多个头像实例）不会叠加定时器。
    func start() {
        guard timer == nil else { return }

        CompanionHotReload.bootstrapIfNeeded()
        lastSignature = CompanionHotReload.signature()

        let timer = Timer(timeInterval: CompanionHotReload.pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }
        // .common 模式：滚动聊天列表时定时器不会被 RunLoop 停掉。
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer

        // 后台期间定时器不跑，回前台补一次比对。
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.poll()
        }

        logger.info("[CompanionHotReload] watching \(CompanionHotReload.primaryLiveDirectory.path)")
    }

    private func poll() {
        let current = CompanionHotReload.signature()
        guard current != lastSignature else { return }
        lastSignature = current
        logger.info("[CompanionHotReload] assets changed on disk → hot reload")
        NotificationCenter.default.post(name: CompanionHotReload.reloadNotification, object: nil)
    }
}
