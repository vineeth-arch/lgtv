import Foundation

/// Text shown by the iPhone app and Siri/Shortcuts. Pure functions so they can be self-checked.
public enum Dialog {
    public static func minutesText(_ minutes: Int) -> String {
        minutes == 1 ? "1 minute" : "\(minutes) minutes"
    }

    public static func timerSet(minutes: Int, offAt: Date, timeZone: TimeZone = .current) -> String {
        "LG TV sleep timer set for \(minutesText(minutes)). TV will turn off at \(TimerCommand.formatOffTime(offAt, timeZone: timeZone))."
    }

    public static let cancelled = "LG TV sleep timer cancelled."
    public static let turnedOff = "Turning the LG TV off now."

    /// Failure text for a phone context (no CLI hints).
    public static func failure(_ error: Error) -> String {
        guard let e = error as? VTVError else { return "Could not reach the LG TV. \(error.localizedDescription)" }
        switch e {
        case .hostMissing, .notPaired:
            return "The LG TV is not paired yet. Open V/TV Remote, enter the TV's IP address and tap Pair."
        case .pairingRejected:
            return "Pairing was rejected on the TV. Open V/TV Remote and tap Pair, then choose Yes on the TV."
        case .certChanged:
            return "The TV's certificate changed. Open V/TV Remote and tap Pair again."
        case .unreachable:
            return "The LG TV is not reachable. Make sure it is on and on the same Wi-Fi as this iPhone."
        case .timeout:
            return "The LG TV did not answer in time. Make sure it is on and on the same Wi-Fi."
        default:
            return e.errorDescription ?? "Something went wrong talking to the LG TV."
        }
    }
}

/// Thin façade the iOS app and App Intents call. Resolves the TV host from the credential store
/// (or an explicit override from the UI) and returns the message to show. Throws `VTVError`.
public struct TVActions: Sendable {
    private let store: CredentialStore
    private let hostOverride: String?
    private let settle: TimeInterval

    public init(store: CredentialStore, host: String? = nil, settle: TimeInterval = 7.0) {
        self.store = store
        let trimmed = host?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.hostOverride = (trimmed?.isEmpty ?? true) ? nil : trimmed
        self.settle = settle
    }

    private func remote() throws -> TVRemote {
        let saved = try store.load().host
        guard let host = hostOverride ?? saved, !host.isEmpty else { throw VTVError.hostMissing }
        return TVRemote(host: host, store: store, settle: settle)
    }

    public func pair(onPrompt: (@Sendable () -> Void)? = nil) async throws -> String {
        let r = try remote()
        try await r.pair(onPrompt: onPrompt)
        return "Paired with the LG TV at \(r.host)."
    }

    public func setTimer(minutes: Int) async throws -> String {
        let result = try await remote().setTimer(minutes: minutes)
        return Dialog.timerSet(minutes: result.minutes, offAt: result.offAt)
    }

    public func cancelTimer() async throws -> String {
        try await remote().cancelTimer()
        return Dialog.cancelled
    }

    public func turnOff() async throws -> String {
        try await remote().turnOff()
        return Dialog.turnedOff
    }

    /// True when a client key is stored for the current host.
    public func isPaired() -> Bool {
        guard let c = try? store.load(), let key = c.clientKey, !key.isEmpty else { return false }
        return hostOverride == nil || hostOverride == c.host
    }
}
