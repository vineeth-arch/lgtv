import AppIntents
import VTVCore

// All intents run in the background (openAppWhenRun = false) and reuse VTVCore's TVActions.
// TVRemote.setTimer waits ~7 s for the TV app to hand the timer to its service, so a run takes ~10 s.

/// Thrown so Shortcuts/Siri show a failure with the real reason instead of a false "done".
struct TVIntentError: Error, CustomLocalizedStringResourceConvertible {
    let message: String
    var localizedStringResource: LocalizedStringResource { "\(message)" }
}

enum TVBackend {
    static let actions = TVActions(store: KeychainCredentialStore())

    static func run(_ work: () async throws -> String) async throws -> some IntentResult & ProvidesDialog {
        do {
            let text = try await work()
            return .result(dialog: "\(text)")
        } catch {
            throw TVIntentError(message: Dialog.failure(error))
        }
    }
}

struct SetTVSleepTimerIntent: AppIntent {
    static let title: LocalizedStringResource = "Set TV Sleep Timer"
    static let description = IntentDescription("Turns the LG TV off after the given number of minutes.")
    static let openAppWhenRun = false

    @Parameter(title: "Minutes", default: 30, inclusiveRange: (1, 720))
    var minutes: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Turn LG TV off in \(\.$minutes) minutes")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let minutes = self.minutes
        return try await TVBackend.run { try await TVBackend.actions.setTimer(minutes: minutes) }
    }
}

struct CancelTVSleepTimerIntent: AppIntent {
    static let title: LocalizedStringResource = "Cancel TV Sleep Timer"
    static let description = IntentDescription("Cancels the LG TV sleep timer.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await TVBackend.run { try await TVBackend.actions.cancelTimer() }
    }
}

struct TurnTVOffIntent: AppIntent {
    static let title: LocalizedStringResource = "Turn TV Off"
    static let description = IntentDescription("Turns the LG TV off right now.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await TVBackend.run { try await TVBackend.actions.turnOff() }
    }
}

struct TV30Intent: AppIntent {
    static let title: LocalizedStringResource = "📺 TV 30"
    static let description = IntentDescription("Turns the LG TV off in 30 minutes.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await TVBackend.run { try await TVBackend.actions.setTimer(minutes: 30) }
    }
}

enum TimerChoice: String, AppEnum {
    case min30, min45, min60, min90, hours2, custom, cancelTimer, turnOffNow

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "TV Timer Option"
    static let caseDisplayRepresentations: [TimerChoice: DisplayRepresentation] = [
        .min30: "30 minutes",
        .min45: "45 minutes",
        .min60: "60 minutes",
        .min90: "90 minutes",
        .hours2: "2 hours",
        .custom: "Custom",
        .cancelTimer: "Cancel timer",
        .turnOffNow: "Turn off now",
    ]

    /// Fixed durations only; nil for custom/cancel/off.
    var fixedMinutes: Int? {
        switch self {
        case .min30: 30
        case .min45: 45
        case .min60: 60
        case .min90: 90
        case .hours2: 120
        case .custom, .cancelTimer, .turnOffNow: nil
        }
    }
}

struct TVTimerMenuIntent: AppIntent {
    static let title: LocalizedStringResource = "📺 TV Timer"
    static let description = IntentDescription("Choose a sleep timer for the LG TV, cancel it, or turn the TV off.")
    static let openAppWhenRun = false

    @Parameter(title: "Option")
    var choice: TimerChoice

    // Only used (and only asked for) when the choice is Custom.
    @Parameter(title: "Minutes", default: 30, inclusiveRange: (1, 720))
    var customMinutes: Int

    static var parameterSummary: some ParameterSummary {
        When(\.$choice, .equalTo, TimerChoice.custom) {
            Summary("TV timer: \(\.$choice) for \(\.$customMinutes) minutes")
        } otherwise: {
            Summary("TV timer: \(\.$choice)")
        }
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let choice = self.choice
        let custom = self.customMinutes
        return try await TVBackend.run {
            switch choice {
            case .cancelTimer: return try await TVBackend.actions.cancelTimer()
            case .turnOffNow: return try await TVBackend.actions.turnOff()
            case .custom: return try await TVBackend.actions.setTimer(minutes: custom)
            default: return try await TVBackend.actions.setTimer(minutes: choice.fixedMinutes ?? 30)
            }
        }
    }
}

struct VTVShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TV30Intent(),
            phrases: [
                "TV thirty with \(.applicationName)",
                "Turn the TV off in 30 minutes with \(.applicationName)",
            ],
            shortTitle: "📺 TV 30",
            systemImageName: "moon.zzz"
        )
        AppShortcut(
            intent: TVTimerMenuIntent(),
            phrases: [
                "TV timer in \(.applicationName)",
                "Set a TV timer with \(.applicationName)",
            ],
            shortTitle: "📺 TV Timer",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: CancelTVSleepTimerIntent(),
            phrases: ["Cancel the TV timer with \(.applicationName)"],
            shortTitle: "Cancel TV Timer",
            systemImageName: "xmark.circle"
        )
        AppShortcut(
            intent: TurnTVOffIntent(),
            phrases: ["Turn TV off with \(.applicationName)"],
            shortTitle: "Turn TV Off",
            systemImageName: "power"
        )
    }
}
