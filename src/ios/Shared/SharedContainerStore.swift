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
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MinisContainer", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
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
        // [T-selfsign-icloud] 纯官方非私有 API，在所有平台与 SDK 下均可安全编译与运行
        FileManager.default.ubiquityIdentityToken != nil
    }
}
