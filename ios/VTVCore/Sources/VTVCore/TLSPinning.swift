import Foundation
import CryptoKit
import Security

public enum CertPin {
    public enum Decision: Equatable, Sendable {
        case trustAndStore   // no pin yet: trust on first use
        case match
        case mismatch
    }

    public static func fingerprint(der: Data) -> String {
        SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
    }

    public static func evaluate(stored: String?, presented: String) -> Decision {
        guard let stored, !stored.isEmpty else { return .trustAndStore }
        return stored.lowercased() == presented.lowercased() ? .match : .mismatch
    }
}

/// Accepts the TV's self-signed certificate for the configured host only, with a TOFU SHA-256 leaf pin.
/// Every other host gets default system evaluation.
public final class TLSPinningDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {
    private let host: String
    private let store: CredentialStore
    private let lock = NSLock()
    private var _pinViolation = false

    public init(host: String, store: CredentialStore) {
        self.host = host
        self.store = store
    }

    public var pinViolation: Bool { lock.lock(); defer { lock.unlock() }; return _pinViolation }

    public func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        let space = challenge.protectionSpace
        guard space.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              space.host == host,
              let trust = space.serverTrust,
              let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        let presented = CertPin.fingerprint(der: SecCertificateCopyData(leaf) as Data)
        do {
            let stored = try store.load().certPin
            switch CertPin.evaluate(stored: stored, presented: presented) {
            case .trustAndStore:
                try store.update { $0.certPin = presented }
                completionHandler(.useCredential, URLCredential(trust: trust))
            case .match:
                completionHandler(.useCredential, URLCredential(trust: trust))
            case .mismatch:
                lock.lock(); _pinViolation = true; lock.unlock()
                completionHandler(.cancelAuthenticationChallenge, nil)
            }
        } catch {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
