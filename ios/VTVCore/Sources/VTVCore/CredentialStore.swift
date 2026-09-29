import Foundation

public struct Credentials: Codable, Sendable, Equatable {
    public var host: String?
    public var clientKey: String?
    /// Lowercase hex SHA-256 of the TV's leaf certificate (DER), pinned on first use.
    public var certPin: String?

    public init(host: String? = nil, clientKey: String? = nil, certPin: String? = nil) {
        self.host = host
        self.clientKey = clientKey
        self.certPin = certPin
    }
}

/// Storage seam: the CLI uses a 0600 file, the iOS app will swap in a Keychain implementation.
public protocol CredentialStore: Sendable {
    func load() throws -> Credentials
    func save(_ credentials: Credentials) throws
}

public extension CredentialStore {
    func update(_ body: (inout Credentials) -> Void) throws {
        var c = try load()
        body(&c)
        try save(c)
    }
}

public final class InMemoryCredentialStore: CredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: Credentials

    public init(_ initial: Credentials = Credentials()) { value = initial }

    public func load() throws -> Credentials { lock.lock(); defer { lock.unlock() }; return value }
    public func save(_ credentials: Credentials) throws { lock.lock(); defer { lock.unlock() }; value = credentials }
}

/// JSON file store, mode 0600 (directory 0700). Default: ~/.config/vtv/tv.json.
public final class FileCredentialStore: CredentialStore, @unchecked Sendable {
    public let url: URL
    private let lock = NSLock()

    public static var defaultURL: URL {
        URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".config/vtv/tv.json")
    }

    public init(url: URL = FileCredentialStore.defaultURL) { self.url = url }

    public func load() throws -> Credentials {
        lock.lock(); defer { lock.unlock() }
        guard FileManager.default.fileExists(atPath: url.path) else { return Credentials() }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(Credentials.self, from: data)
    }

    public func save(_ credentials: Credentials) throws {
        lock.lock(); defer { lock.unlock() }
        let fm = FileManager.default
        let dir = url.deletingLastPathComponent()
        try fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try enc.encode(credentials)
        // Create with 0600 from the start, then enforce in case the file pre-existed with looser bits.
        let tmp = dir.appendingPathComponent(".tv.json.\(UUID().uuidString).tmp")
        guard fm.createFile(atPath: tmp.path, contents: data, attributes: [.posixPermissions: 0o600]) else {
            throw VTVError.transport("cannot write credential file")
        }
        _ = try fm.replaceItemAt(url, withItemAt: tmp)
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}
