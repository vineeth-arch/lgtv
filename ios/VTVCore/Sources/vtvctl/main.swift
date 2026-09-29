import Foundation
import VTVCore

let usage = """
vtvctl - control the V/TV Sleep timer on an LG webOS TV over SSAP

Usage:
  vtvctl pair --host <ip> [--reset-pin]   Pair with the TV (accept the prompt on the TV)
  vtvctl timer <minutes>                  Turn the TV off in 1-720 minutes
  vtvctl cancel                           Cancel the timer
  vtvctl off                              Turn the TV off now
  vtvctl foreground                       Print the foreground app id

Options:
  --host <ip>    TV address (saved after the first use)
  --json         Machine-readable output
  --help, -h     Show this help

Credentials: ~/.config/vtv/tv.json (mode 0600). The client key is never printed.
"""

struct Output {
    let json: Bool
    func success(_ text: String, _ fields: [String: JSONValue] = [:]) {
        if json {
            var o = fields
            o["ok"] = .bool(true)
            o["message"] = .string(text)
            print(String(decoding: (try? JSONValue.object(o).serialized()) ?? Data(), as: UTF8.self))
        } else {
            print(text)
        }
    }
    func failure(_ text: String) {
        if json {
            let o: JSONValue = .object(["ok": .bool(false), "error": .string(text)])
            print(String(decoding: (try? o.serialized()) ?? Data(), as: UTF8.self))
        } else {
            FileHandle.standardError.write(Data(("error: " + text + "\n").utf8))
        }
    }
}

func run(_ argv: [String]) async -> Int32 {
    var args = argv
    let wantsHelp = args.isEmpty || args.contains("--help") || args.contains("-h")
    let out = Output(json: args.contains("--json"))
    args.removeAll { $0 == "--json" }
    if wantsHelp { print(usage); return args.isEmpty && argv.isEmpty ? 2 : 0 }

    var host: String?
    var resetPin = false
    var positional: [String] = []
    var i = 0
    while i < args.count {
        switch args[i] {
        case "--host":
            guard i + 1 < args.count else { out.failure("--host needs a value"); return 2 }
            host = args[i + 1]; i += 2
        case "--reset-pin":
            resetPin = true; i += 1
        default:
            positional.append(args[i]); i += 1
        }
    }
    guard let command = positional.first else { print(usage); return 2 }

    let store = FileCredentialStore()
    do {
        let savedHost = try store.load().host
        guard let resolved = host ?? savedHost, !resolved.isEmpty else { throw VTVError.hostMissing }
        let tv = TVRemote(host: resolved, store: store)
        switch command {
        case "pair":
            let quiet = out.json
            try await tv.pair(resetPin: resetPin, onPrompt: { if !quiet { print("Accept the pairing prompt on the TV (60 s)...") } })
            out.success("Paired with TV at \(resolved)", ["host": .string(resolved)])
        case "timer":
            guard positional.count == 2, let minutes = Int(positional[1]) else {
                out.failure("usage: vtvctl timer <minutes>  (whole number, 1-720)"); return 2
            }
            let r = try await tv.setTimer(minutes: minutes)
            out.success(TimerCommand.scheduledMessage(minutes: r.minutes, offAt: r.offAt, restoredApp: r.restoredApp), [
                "minutes": .int(r.minutes),
                "offAt": .string(ISO8601DateFormatter().string(from: r.offAt)),
                "restoredApp": r.restoredApp.map { .string($0) } ?? .null,
            ])
        case "cancel":
            try await tv.cancelTimer()
            out.success(TimerCommand.cancelledMessage)
        case "off":
            try await tv.turnOff()
            out.success(TimerCommand.turnedOffMessage)
        case "foreground":
            let app = try await tv.foregroundApp()
            out.success(app.isEmpty ? "No foreground app" : "Foreground app: \(app)", ["appId": .string(app)])
        default:
            out.failure("unknown command '\(command)'"); print(usage); return 2
        }
        return 0
    } catch {
        out.failure((error as? LocalizedError)?.errorDescription ?? "\(error)")
        return 1
    }
}

exit(await run(Array(CommandLine.arguments.dropFirst())))
