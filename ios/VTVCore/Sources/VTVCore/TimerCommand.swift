import Foundation

public enum TimerCommand {
    public static let minMinutes = 1
    public static let maxMinutes = 720
    public static let appID = "com.designinnsaeit.vtvsleep"

    /// Rejects (never clamps) anything outside 1...720.
    public static func validate(_ minutes: Int) throws -> Int {
        guard (minMinutes...maxMinutes).contains(minutes) else { throw VTVError.invalidMinutes(minutes) }
        return minutes
    }

    public static func launchParams(minutes: Int) -> JSONValue {
        .object(["mode": .string("schedule"), "minutes": .int(minutes)])
    }

    public static let cancelParams: JSONValue = .object(["mode": .string("cancel")])

    public static func offAt(from now: Date, minutes: Int) -> Date {
        now.addingTimeInterval(TimeInterval(minutes * 60))
    }

    /// e.g. "11:42 PM" (fixed locale so output is stable).
    public static func formatOffTime(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "h:mm a"
        return f.string(from: date)
    }

    public static func scheduledMessage(minutes: Int, offAt: Date, restoredApp: String?, timeZone: TimeZone = .current) -> String {
        var s = "TV off in \(minutes) min at \(formatOffTime(offAt, timeZone: timeZone))"
        if let restoredApp { s += " (restored \(restoredApp))" }
        return s
    }

    public static let cancelledMessage = "TV timer cancelled"
    public static let turnedOffMessage = "TV turning off"
}
