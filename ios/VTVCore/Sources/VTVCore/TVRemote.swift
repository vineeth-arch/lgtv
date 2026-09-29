import Foundation

public struct TimerResult: Sendable, Equatable {
    public let minutes: Int
    public let offAt: Date
    public let restoredApp: String?
}

/// High-level TV operations. Each call opens a fresh connection and closes it.
public struct TVRemote: Sendable {
    public let host: String
    private let store: CredentialStore
    private let settle: TimeInterval

    /// Apps we never switch back to after launching V/TV.
    private static let skipRestore: Set<String> = [TimerCommand.appID, "com.webos.app.home", "com.webos.app.livetv-launcher-shim", ""]

    public init(host: String, store: CredentialStore, settle: TimeInterval = 1.5) {
        self.host = host
        self.store = store
        self.settle = settle
    }

    /// Registers (showing the on-TV prompt if needed). `onPrompt` fires when the TV displays it.
    public func pair(resetPin: Bool = false, onPrompt: (@Sendable () -> Void)? = nil) async throws {
        if resetPin { try store.update { $0.certPin = nil } }
        let client = SSAPClient(host: host, store: store)
        try await client.connect(allowPrompt: true, onPrompt: onPrompt)
        await client.close()
    }

    public func setTimer(minutes: Int, now: @Sendable () -> Date = { Date() }) async throws -> TimerResult {
        let m = try TimerCommand.validate(minutes)
        return try await withClient { client in
            let prior = try? await Self.foreground(client)
            _ = try await client.request(uri: "ssap://system.launcher/launch",
                                         payload: .object(["id": .string(TimerCommand.appID), "params": TimerCommand.launchParams(minutes: m)]))
            let offAt = TimerCommand.offAt(from: now(), minutes: m)
            try await Task.sleep(nanoseconds: UInt64(settle * 1_000_000_000))
            var restored: String?
            if let prior, !Self.skipRestore.contains(prior),
               (try? await client.request(uri: "ssap://system.launcher/launch", payload: .object(["id": .string(prior)]))) != nil {
                restored = prior
            }
            return TimerResult(minutes: m, offAt: offAt, restoredApp: restored)
        }
    }

    public func cancelTimer() async throws {
        try await withClient { client in
            _ = try await client.request(uri: "ssap://system.launcher/launch",
                                         payload: .object(["id": .string(TimerCommand.appID), "params": TimerCommand.cancelParams]))
            try await Task.sleep(nanoseconds: UInt64(settle * 1_000_000_000))
        }
    }

    public func turnOff() async throws {
        try await withClient { client in
            _ = try await client.request(uri: "ssap://system/turnOff")
        }
    }

    /// Foreground app id ("" if none). Throws if the TV refuses the call.
    public func foregroundApp() async throws -> String {
        try await withClient { client in try await Self.foreground(client) }
    }

    private static func foreground(_ client: SSAPClient) async throws -> String {
        let r = try await client.request(uri: "ssap://com.webos.applicationManager/getForegroundAppInfo")
        return r["appId"]?.stringValue ?? ""
    }

    private func withClient<T: Sendable>(_ body: (SSAPClient) async throws -> T) async throws -> T {
        let client = SSAPClient(host: host, store: store)
        try await client.connect(allowPrompt: false)
        do {
            let v = try await body(client)
            await client.close()
            return v
        } catch {
            await client.close()
            throw error
        }
    }
}
