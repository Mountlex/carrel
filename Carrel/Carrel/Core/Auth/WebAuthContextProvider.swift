import UIKit
import AuthenticationServices

/// Provides the presentation context for ASWebAuthenticationSession
final class WebAuthContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuthContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }

        if let keyWindow = scenes
            .first(where: { $0.activationState == .foregroundActive })?
            .windows
            .first(where: \.isKeyWindow) {
            return keyWindow
        }

        if let anyWindow = scenes.lazy.flatMap(\.windows).first {
            return anyWindow
        }

        guard let scene = scenes.first else {
            preconditionFailure("No UIWindowScene available for ASWebAuthenticationSession")
        }
        return ASPresentationAnchor(windowScene: scene)
    }
}
