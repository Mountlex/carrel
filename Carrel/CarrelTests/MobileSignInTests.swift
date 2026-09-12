import Foundation
import Testing
@testable import Carrel

struct MobileSignInTests {
    @Test func requestKeepsVerifierOutOfBrowserURL() throws {
        let request = try MobileSignInRequest()
        let url = request.url(siteURL: URL(string: "https://example.com")!, provider: "github")
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
        #expect(request.verifier.count == 43)
        #expect(request.challenge.count == 43)
        #expect(request.state != request.verifier)
        #expect(!url.absoluteString.contains(request.verifier))
        #expect(items.first { $0.name == "codeChallenge" }?.value == request.challenge)
    }

    @Test func callbacksMustBelongToTheCurrentRequest() throws {
        let request = try MobileSignInRequest()
        let code = try request.authorizationCode(from: URL(string: "carrel://auth/callback?code=one-use&state=\(request.state)")!)
        #expect(code == "one-use")
        let invalid = [
            "carrel://auth/callback?code=one-use&state=another-request",
            "carrel://auth/callback?accessToken=secret&state=\(request.state)",
            "https://auth/callback?code=one-use&state=\(request.state)",
            "carrel://other/callback?code=one-use&state=\(request.state)",
            "carrel://auth/callback?code=a&code=b&state=\(request.state)",
            "carrel://auth/callback?code=a&state=\(request.state)&state=\(request.state)",
            "carrel://auth/callback?code=&state=\(request.state)"
        ]
        for value in invalid {
            #expect(throws: SessionError.invalidCallback) { try request.authorizationCode(from: URL(string: value)!) }
        }
    }

    @Test func requestsHaveIndependentSecrets() throws {
        let first = try MobileSignInRequest(), second = try MobileSignInRequest()
        #expect(first.verifier != second.verifier)
        #expect(first.state != second.state)
    }

    @Test func localSessionClaimsDecodeMillisecondsCorrectly() {
        let payload = Data(#"{"sub":"account|mobile:session","exp":2000000000}"#.utf8).base64EncodedString()
        let claims = SessionToken("header.\(payload).signature")
        #expect(claims?.userID == "account")
        #expect(claims?.expiresAt == Date(timeIntervalSince1970: 2_000_000_000))
        #expect(SessionToken("invalid") == nil)
    }
}
