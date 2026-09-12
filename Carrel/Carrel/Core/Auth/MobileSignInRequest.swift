import Foundation
import CryptoKit
import Security

/// Bind a short-lived, single-use authorization code to this installation's request.
nonisolated struct MobileSignInRequest {
    let verifier: String
    let state: String

    init() throws {
        verifier = try Self.randomValue()
        state = try Self.randomValue()
    }

    var challenge: String { Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }

    func url(siteURL: URL, provider: String) -> URL {
        var url = URLComponents(url: siteURL.appendingPathComponent("mobile-auth"), resolvingAgainstBaseURL: false)!
        url.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "codeChallenge", value: challenge),
            URLQueryItem(name: "state", value: state)
        ]
        return url.url!
    }

    func authorizationCode(from url: URL) throws -> String {
        guard url.scheme == "carrel", url.host == "auth", url.path == "/callback",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              items.filter({ $0.name == "state" }).count == 1,
              items.first(where: { $0.name == "state" })?.value == state,
              items.filter({ $0.name == "code" }).count == 1,
              let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw SessionError.invalidCallback
        }
        return code
    }

    private static func randomValue() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw SessionError.invalidCallback
        }
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
