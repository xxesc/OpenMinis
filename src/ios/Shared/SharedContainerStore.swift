import Foundation
import Security

/// Reads and writes PendingShare data to the App Group shared container.
/// Compiled into both the main app target and the Share Extension target.
enum SharedContainerStore {
    static let appGroupID = "group.com.openminis.app"

    private static let pendingShareKey = "pendingShare"

    static var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    /// Directory in the shared container for transferring attachment files.
    static var sharedFileDirectory: URL? {
        containerURL.appendingPathComponent("ShareExtension", isDirectory: true)
    }

    /// [SelfSign-Fallback] 自签构建没有 `group.com.openminis.app` 授权时，
    /// `containerURL(forSecurityApplicationGroupIdentifier:)` 返回 nil。
    /// 官方代码在多处以 `!` 强制解包，会启动即崩。这里统一兜底到 App 自己的
    /// Application Support 目录，保证沙盒根、memory/skills/shared 仍可读写。
    static var containerURL: URL {
        if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) {
            return url
        }
        // [SelfSign-Fallback] 没有 App Group 授权时，用户可见目录落到 Documents 下，
        // 配合 Info.plist 的 UIFileSharingEnabled，让「文件」App 出现可写入口：
        //   On My iPhone → <App> → MinisData → MinisFileProvider → {shared,skills,memory}
        // 以及一个短入口 Documents/Minis → 上面那个目录。
        let fm = FileManager.default
        let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let base = docs.appendingPathComponent("MinisData", isDirectory: true)
        try? fm.createDirectory(at: base, withIntermediateDirectories: true)
        migrateLegacyFallbackIfNeeded(into: base)
        ensureUserFacingShortcut(docs: docs, base: base)
        return base
    }

    /// 存放绝不能进「文件」App 的东西（MCP servers.json 凭据、扩展日志等）。
    /// 有 App Group 时等同于共享容器；自签环境回落到沙盒 Library。
    static var privateRootURL: URL {
        if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) {
            return url
        }
        let base = legacyFallbackURL
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    /// 旧版自签构建把用户目录放在 Library/Application Support/MinisContainer。
    private static var legacyFallbackURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MinisContainer", isDirectory: true)
    }

    private static func migrateLegacyFallbackIfNeeded(into base: URL) {
        let fm = FileManager.default
        let legacy = legacyFallbackURL
        guard fm.fileExists(atPath: legacy.path) else { return }
        let src = legacy.appendingPathComponent("MinisFileProvider", isDirectory: true)
        let dst = base.appendingPathComponent("MinisFileProvider", isDirectory: true)
        guard fm.fileExists(atPath: src.path), !fm.fileExists(atPath: dst.path) else { return }
        try? fm.moveItem(at: src, to: dst)
    }

    /// Documents/Minis → Documents/MinisData/MinisFileProvider，少点两层目录。
    private static func ensureUserFacingShortcut(docs: URL, base: URL) {
        let fm = FileManager.default
        let target = base.appendingPathComponent("MinisFileProvider", isDirectory: true)
        try? fm.createDirectory(at: target, withIntermediateDirectories: true)
        let link = docs.appendingPathComponent("Minis")
        var st = stat()
        guard lstat(link.path, &st) != 0 else { return }
        try? fm.createSymbolicLink(atPath: link.path,
                                   withDestinationPath: "MinisData/MinisFileProvider")
    }


    // MARK: - Write (called by Share Extension)

    static func savePendingShare(_ share: PendingShare) {
        guard let defaults = sharedDefaults else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(share) {
            defaults.set(data, forKey: pendingShareKey)
            defaults.synchronize()
        }
    }

    // MARK: - Read & Consume (called by main app)

    static func loadPendingShare() -> PendingShare? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: pendingShareKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(PendingShare.self, from: data)
    }

    static func clearPendingShare() {
        sharedDefaults?.removeObject(forKey: pendingShareKey)
        sharedDefaults?.synchronize()
    }

    /// Remove all files from the shared transfer directory.
    static func cleanSharedFiles() {
        guard let dir = sharedFileDirectory else { return }
        let fm = FileManager.default
        if let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
            for file in files {
                try? fm.removeItem(at: file)
            }
        }
    }
}


/// [SelfSign-iCloud-Gate] 探测本 App 是否真的被授予 iCloud 容器权限。
/// 自签构建的描述文件 `icloud-container-identifiers` 为空数组时，
/// `CKContainer(identifier:)` 会抛 ObjC 异常（objc_exception_throw）直接闪退。
///
/// 实现方式：使用 FileManager 的官方 API `ubiquityIdentityToken`。
/// 苹果官方文档规定：若当前 App 缺少 iCloud 容器 entitlements，或用户未登录 iCloud，
/// `ubiquityIdentityToken` 会安全地返回 nil（绝不抛异常）。
/// 只要它返回 nil，说明当前环境无法安全使用任何 CloudKit/iCloud 容器。
enum MinisICloudCapability {
    static let containerIdentifier = "iCloud.com.openminis.app"

    static var isAvailable: Bool {
        // iCloud 功能已按需彻底禁用
        false
    }
}
