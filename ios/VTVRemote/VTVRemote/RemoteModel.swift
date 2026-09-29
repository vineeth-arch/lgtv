import Foundation
import Observation
import VTVCore

/// UI state only. All TV logic lives in VTVCore (`TVActions`).
@MainActor
@Observable
final class RemoteModel {
    static let presets = [30, 45, 60, 90, 120]

    var host = ""
    var customMinutes = 45
    var busy = false
    var lastResult = "Nothing sent yet."

    private let store = KeychainCredentialStore()

    /// Reads the Keychain; re-evaluated whenever `host` or a command result changes.
    var isPaired: Bool { TVActions(store: store, host: host).isPaired() }

    var status: String {
        isPaired ? "Paired with \(host.trimmingCharacters(in: .whitespaces))."
                 : "Not paired. Enter the TV's IP address and tap Pair."
    }

    func load() {
        if host.isEmpty, let saved = try? store.load().host { host = saved }
    }

    func pair() {
        run(progress: "Pairing... look at the TV and choose Yes.") { [store, host] in
            try await TVActions(store: store, host: host).pair()
        }
    }

    func setTimer(_ minutes: Int) {
        run(progress: "Sending to the TV (about 10 seconds)...") { [store, host] in
            try await TVActions(store: store, host: host).setTimer(minutes: minutes)
        }
    }

    func cancelTimer() {
        run(progress: "Cancelling (about 10 seconds)...") { [store, host] in
            try await TVActions(store: store, host: host).cancelTimer()
        }
    }

    func turnOffNow() {
        run(progress: "Turning the TV off...") { [store, host] in
            try await TVActions(store: store, host: host).turnOff()
        }
    }

    private func run(progress: String, _ work: @escaping @Sendable () async throws -> String) {
        guard !busy else { return }
        busy = true
        lastResult = progress
        Task {
            do {
                let message = try await work()
                lastResult = message
            } catch {
                lastResult = Dialog.failure(error)
            }
            busy = false
        }
    }
}
