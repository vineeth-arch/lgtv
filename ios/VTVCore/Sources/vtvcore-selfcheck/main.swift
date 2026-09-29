import Foundation
import VTVCore

nonisolated(unsafe) var failures = 0
nonisolated(unsafe) var total = 0

func check(_ ok: Bool, _ name: String) {
    total += 1
    if ok { print("ok   \(name)") } else { failures += 1; print("FAIL \(name)") }
}

func json(_ v: JSONValue) -> String { String(decoding: (try? v.serialized()) ?? Data(), as: UTF8.self) }

// Validation bounds
for m in [0, -1, 721, 10_000] {
    check((try? TimerCommand.validate(m)) == nil, "reject \(m)")
}
for m in [1, 30, 720] {
    check((try? TimerCommand.validate(m)) == m, "accept \(m)")
}
do { _ = try TimerCommand.validate(721) } catch { check(error as? VTVError == .invalidMinutes(721), "rejection is invalidMinutes, not clamp") }

// Launch params
check(json(TimerCommand.launchParams(minutes: 30)) == #"{"minutes":30,"mode":"schedule"}"#, "launch params schedule shape")
check(json(TimerCommand.cancelParams) == #"{"mode":"cancel"}"#, "launch params cancel shape")

// Register message
let reg = SSAP.registerMessage(clientKey: nil)
check(reg["type"]?.stringValue == "register" && reg["id"]?.stringValue == "register_0", "register type/id")
check(reg["payload"]?["client-key"] == nil, "register without key omits client-key")
check(reg["payload"]?["pairingType"]?.stringValue == "PROMPT" && reg["payload"]?["forcePairing"] == .bool(false), "register PROMPT, forcePairing false")
check(reg["payload"]?["manifest"]?["permissions"] == .array(["LAUNCH", "CONTROL_POWER", "READ_RUNNING_APPS", "READ_APP_STATUS", "READ_POWER_STATE", "WRITE_NOTIFICATION_TOAST"].map { .string($0) }), "manifest permissions")
check(reg["payload"]?["manifest"]?["signed"] == nil, "manifest unsigned")
check(SSAP.registerMessage(clientKey: "abc")["payload"]?["client-key"]?.stringValue == "abc", "register with key")
check(!json(reg).contains("\\/"), "no escaped slashes")

// Off-time formatting
let utc = TimeZone(identifier: "UTC")!
let base = Date(timeIntervalSince1970: 1_700_000_000) // 2023-11-14 22:13:20 UTC
check(TimerCommand.formatOffTime(TimerCommand.offAt(from: base, minutes: 30), timeZone: utc) == "10:43 PM", "off-time 10:43 PM")
check(TimerCommand.formatOffTime(TimerCommand.offAt(from: base, minutes: 120), timeZone: utc) == "12:13 AM", "off-time wraps midnight")
check(TimerCommand.scheduledMessage(minutes: 30, offAt: TimerCommand.offAt(from: base, minutes: 30), restoredApp: nil, timeZone: utc) == "TV off in 30 min at 10:43 PM", "scheduled message")

// Response routing by id
var table = PendingTable<String>()
table.add("req_1", "a"); table.add("req_2", "b")
if case .response(let id, _) = SSAP.classify(Data(#"{"type":"response","id":"req_2","payload":{"returnValue":true}}"#.utf8)) {
    check(id == "req_2" && table.take(id) == "b" && table.count == 1, "response routed to matching id only")
} else { check(false, "response classified") }
check(table.take("req_2") == nil, "id consumed once")
check(SSAP.classify(Data(#"{"type":"registered","id":"register_0","payload":{"client-key":"K"}}"#.utf8)) == .registered(clientKey: "K"), "classify registered")
check(SSAP.classify(Data(#"{"type":"response","id":"register_0","payload":{"pairingType":"PROMPT","returnValue":true}}"#.utf8)) == .prompt(id: "register_0"), "classify PROMPT")
check(SSAP.classify(Data(#"{"type":"error","id":"req_3","error":"401 insufficient permissions"}"#.utf8)) == .error(id: "req_3", message: "401 insufficient permissions"), "classify error")
check(SSAP.classify(Data("garbage".utf8)) == .other, "classify garbage")

// Cert pin
let fp = CertPin.fingerprint(der: Data("abc".utf8))
check(fp == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256 fingerprint")
check(CertPin.evaluate(stored: nil, presented: fp) == .trustAndStore, "pin: first use trusts")
check(CertPin.evaluate(stored: fp, presented: fp.uppercased()) == .match, "pin: match (case-insensitive)")
check(CertPin.evaluate(stored: fp, presented: String(repeating: "0", count: 64)) == .mismatch, "pin: mismatch")

// File store: 0600, round trip
let dir = FileManager.default.temporaryDirectory.appendingPathComponent("vtv-selfcheck-\(UUID().uuidString)")
let file = FileCredentialStore(url: dir.appendingPathComponent("tv.json"))
do {
    try file.save(Credentials(host: "10.0.0.1", clientKey: "k", certPin: fp))
    let back = try file.load()
    check(back == Credentials(host: "10.0.0.1", clientKey: "k", certPin: fp), "file store round trip")
    let attrs = try FileManager.default.attributesOfItem(atPath: file.url.path)
    check((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600, "credential file mode 0600")
    try file.update { $0.certPin = nil }
    check(try file.load().certPin == nil && (try file.load().clientKey == "k"), "store update clears pin only")
} catch { check(false, "file store: \(error)") }
try? FileManager.default.removeItem(at: dir)

print("\(total - failures)/\(total) checks passed")
exit(failures == 0 ? 0 : 1)
