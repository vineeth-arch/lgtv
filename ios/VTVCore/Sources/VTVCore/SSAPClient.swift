import Foundation

/// Pure SSAP protocol helpers (no I/O) so they can be self-checked.
public enum SSAP {
    public static let registerID = "register_0"
    // Unsigned manifest, same permissions as tv-service/lib/ssap.js (a signed one is rejected by current firmware).
    public static let permissions = ["LAUNCH", "CONTROL_POWER", "READ_RUNNING_APPS", "READ_APP_STATUS", "READ_POWER_STATE", "WRITE_NOTIFICATION_TOAST"]

    public static var manifest: JSONValue {
        .object([
            "manifestVersion": .int(1),
            "appVersion": .string("1.1"),
            "permissions": .array(permissions.map { .string($0) }),
        ])
    }

    public static func registerMessage(clientKey: String?) -> JSONValue {
        var payload: [String: JSONValue] = [
            "forcePairing": .bool(false),
            "pairingType": .string("PROMPT"),
            "manifest": manifest,
        ]
        if let clientKey, !clientKey.isEmpty { payload["client-key"] = .string(clientKey) }
        return .object(["type": .string("register"), "id": .string(registerID), "payload": .object(payload)])
    }

    public static func requestMessage(id: String, uri: String, payload: JSONValue?) -> JSONValue {
        .object(["type": .string("request"), "id": .string(id), "uri": .string(uri), "payload": payload ?? .object([:])])
    }

    public enum Incoming: Equatable, Sendable {
        case registered(clientKey: String?)
        case prompt(id: String)
        case response(id: String, payload: JSONValue)
        case error(id: String?, message: String)
        case other
    }

    public static func classify(_ data: Data) -> Incoming {
        guard let m = JSONValue.parse(data), let type = m["type"]?.stringValue else { return .other }
        let id = m["id"]?.stringValue
        switch type {
        case "registered":
            return .registered(clientKey: m["payload"]?["client-key"]?.stringValue)
        case "response":
            guard let id else { return .other }
            if m["payload"]?["pairingType"]?.stringValue == "PROMPT" { return .prompt(id: id) }
            return .response(id: id, payload: m["payload"] ?? .object(["returnValue": .bool(true)]))
        case "error":
            return .error(id: id, message: m["error"]?.stringValue ?? "unknown error")
        default:
            return .other
        }
    }
}

/// Request-id routing table: one waiter per outstanding id.
public struct PendingTable<Value> {
    private var items: [String: Value] = [:]
    public init() {}
    public mutating func add(_ id: String, _ value: Value) { items[id] = value }
    public mutating func take(_ id: String) -> Value? { items.removeValue(forKey: id) }
    public mutating func takeAll() -> [Value] { let v = Array(items.values); items.removeAll(); return v }
    public var count: Int { items.count }
}

/// One WebSocket session to the TV. Connect, register, request by id, close.
public actor SSAPClient {
    private struct Waiter {
        let continuation: CheckedContinuation<JSONValue, Error>
        let timeout: Task<Void, Never>
    }

    private let host: String
    private let port: Int
    private let store: CredentialStore
    private let requestTimeout: TimeInterval
    private let normalRegisterTimeout: TimeInterval
    private let pairTimeout: TimeInterval

    private var pending = PendingTable<Waiter>()
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var delegate: TLSPinningDelegate?
    private var receiveTask: Task<Void, Never>?
    private var allowPrompt = false
    private var onPrompt: (@Sendable () -> Void)?
    private var closing = false
    private var counter = 0

    public init(host: String, port: Int = 3001, store: CredentialStore,
                requestTimeout: TimeInterval = 8, registerTimeout: TimeInterval = 8, pairTimeout: TimeInterval = 60) {
        self.host = host
        self.port = port
        self.store = store
        self.requestTimeout = requestTimeout
        self.normalRegisterTimeout = registerTimeout
        self.pairTimeout = pairTimeout
    }

    /// Opens the socket and registers. With allowPrompt the TV may show its pairing prompt (60 s); otherwise a missing/unaccepted key fails fast.
    public func connect(allowPrompt: Bool, onPrompt: (@Sendable () -> Void)? = nil) async throws {
        var creds = try store.load()
        if creds.host != host { // different TV: never reuse another TV's key or pin
            creds = Credentials(host: host)
            try store.save(creds)
        }
        if !allowPrompt && (creds.clientKey ?? "").isEmpty { throw VTVError.notPaired }

        self.allowPrompt = allowPrompt
        self.onPrompt = onPrompt
        closing = false

        let delegate = TLSPinningDelegate(host: host, store: store)
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
        guard let url = URL(string: "wss://\(host):\(port)") else { throw VTVError.hostMissing }
        let socket = session.webSocketTask(with: url)
        self.delegate = delegate
        self.session = session
        self.socket = socket
        socket.resume()
        receiveTask = Task { [weak self] in await self?.receiveLoop(socket) }

        do {
            _ = try await roundTrip(id: SSAP.registerID,
                                    message: SSAP.registerMessage(clientKey: creds.clientKey),
                                    timeout: allowPrompt ? pairTimeout : normalRegisterTimeout)
        } catch {
            close()
            throw error
        }
    }

    public func request(uri: String, payload: JSONValue? = nil) async throws -> JSONValue {
        counter += 1
        let id = "req_\(counter)"
        let reply = try await roundTrip(id: id, message: SSAP.requestMessage(id: id, uri: uri, payload: payload), timeout: requestTimeout)
        if reply["returnValue"]?.boolValue == false {
            let text = reply["errorText"]?.stringValue ?? "returnValue false"
            throw VTVError.requestFailed(text)
        }
        return reply
    }

    public func close() {
        closing = true
        receiveTask?.cancel()
        receiveTask = nil
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        session?.invalidateAndCancel() // breaks the session -> delegate retain cycle
        session = nil
        fail(all: VTVError.closed)
    }

    // MARK: - internals

    private func roundTrip(id: String, message: JSONValue, timeout: TimeInterval) async throws -> JSONValue {
        guard let socket else { throw VTVError.closed }
        let data = try message.serialized()
        guard let text = String(data: data, encoding: .utf8) else { throw VTVError.transport("encoding") }
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<JSONValue, Error>) in
            let timer = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if Task.isCancelled { return }
                await self?.fail(id: id, VTVError.timeout)
            }
            pending.add(id, Waiter(continuation: cont, timeout: timer))
            Task { [weak self] in
                do { try await socket.send(.string(text)) }
                catch { await self?.transportFailed(error) }
            }
        }
    }

    private func receiveLoop(_ socket: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let message = try await socket.receive()
                let data: Data
                switch message {
                case .string(let s): data = Data(s.utf8)
                case .data(let d): data = d
                @unknown default: continue
                }
                handle(SSAP.classify(data))
            } catch {
                if !closing { transportFailed(error) }
                return
            }
        }
    }

    private func handle(_ incoming: SSAP.Incoming) {
        switch incoming {
        case .registered(let key):
            if let key, !key.isEmpty { try? store.update { $0.clientKey = key } }
            resolve(id: SSAP.registerID, .object(["client-key": .string(key ?? "")]))
        case .prompt(let id):
            if allowPrompt { onPrompt?() } else { fail(id: id, VTVError.notPaired) }
        case .response(let id, let payload):
            resolve(id: id, payload)
        case .error(let id, let message):
            guard let id else { return }
            if id == SSAP.registerID {
                let lower = message.lowercased()
                fail(id: id, lower.contains("403") || lower.contains("denied") || lower.contains("reject")
                     ? VTVError.pairingRejected : VTVError.requestFailed(message))
            } else {
                fail(id: id, VTVError.requestFailed(message))
            }
        case .other:
            break
        }
    }

    private func resolve(id: String, _ value: JSONValue) {
        guard let w = pending.take(id) else { return }
        w.timeout.cancel()
        w.continuation.resume(returning: value)
    }

    private func fail(id: String, _ error: Error) {
        guard let w = pending.take(id) else { return }
        w.timeout.cancel()
        w.continuation.resume(throwing: error)
    }

    private func fail(all error: Error) {
        for w in pending.takeAll() {
            w.timeout.cancel()
            w.continuation.resume(throwing: error)
        }
    }

    private func transportFailed(_ error: Error) {
        fail(all: SSAPClient.map(error, pinViolation: delegate?.pinViolation ?? false))
    }

    static func map(_ error: Error, pinViolation: Bool) -> VTVError {
        if pinViolation { return .certChanged }
        if let v = error as? VTVError { return v }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain {
            switch ns.code {
            case NSURLErrorTimedOut: return .timeout
            case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost, NSURLErrorNotConnectedToInternet,
                 NSURLErrorNetworkConnectionLost, NSURLErrorDNSLookupFailed, NSURLErrorInternationalRoamingOff:
                return .unreachable
            case NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate,
                 NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid,
                 NSURLErrorSecureConnectionFailed, NSURLErrorCancelled:
                return .transport(ns.localizedDescription)
            default: break
            }
        }
        return .transport(ns.localizedDescription)
    }
}
