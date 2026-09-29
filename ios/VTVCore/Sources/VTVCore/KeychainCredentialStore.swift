import Foundation
#if canImport(Security)
import Security

/// Keychain-backed store for the iOS app: one generic-password item holding the JSON-encoded
/// `Credentials` (host, client key, cert pin). Readable after the first unlock, so App Intents
/// work when the phone is locked-but-unlocked-once and the app UI was never opened.
public final class KeychainCredentialStore: CredentialStore, @unchecked Sendable {
    private let service: String
    private let account: String
    private let lock = NSLock()

    public init(service: String = "com.designinnsaeit.vtvremote", account: String = "tv-credentials") {
        self.service = service
        self.account = account
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    public func load() throws -> Credentials {
        lock.lock(); defer { lock.unlock() }
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        if status == errSecItemNotFound { return Credentials() }
        guard status == errSecSuccess, let data = out as? Data else {
            throw VTVError.transport("keychain read failed (\(status))")
        }
        return try JSONDecoder().decode(Credentials.self, from: data)
    }

    public func save(_ credentials: Credentials) throws {
        lock.lock(); defer { lock.unlock() }
        let data = try JSONEncoder().encode(credentials)
        let update: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(baseQuery as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            throw VTVError.transport("keychain write failed (\(status))")
        }
    }
}
#endif
