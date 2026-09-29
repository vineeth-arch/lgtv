import Foundation

public enum VTVError: Error, Equatable, Sendable, LocalizedError {
    case invalidMinutes(Int)
    case hostMissing
    case unreachable
    case notPaired
    case pairingRejected
    case certChanged
    case timeout
    case closed
    case requestFailed(String)
    case transport(String)

    public var errorDescription: String? {
        switch self {
        case .invalidMinutes(let m): return "Minutes must be a whole number from 1 to 720 (got \(m))."
        case .hostMissing: return "No TV host configured. Run: vtvctl pair --host <ip>"
        case .unreachable: return "TV unreachable — is it on and on the same network?"
        case .notPaired: return "Not paired with the TV. Run: vtvctl pair --host <ip> and accept the prompt on the TV."
        case .pairingRejected: return "Pairing was rejected on the TV."
        case .certChanged: return "TV certificate changed — re-pair (vtvctl pair --reset-pin)."
        case .timeout: return "Timed out waiting for the TV."
        case .closed: return "Connection to the TV closed unexpectedly."
        case .requestFailed(let s): return "TV rejected the request: \(s)"
        case .transport(let s): return "Connection error: \(s)"
        }
    }
}
