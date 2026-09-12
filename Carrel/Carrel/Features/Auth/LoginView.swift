import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var authSession: ASWebAuthenticationSession?
    @State private var error: String?
    @State private var isStartingSignIn = false
    @State private var activeProvider: OAuthProvider?

    var body: some View {
        ZStack {
            // Background
            Color(uiColor: .systemBackground)
                .ignoresSafeArea()

            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 32) {
                        Spacer(minLength: 16)
                        VStack(spacing: 12) {
                            Text("Carrel")
                                .font(.largeTitle.bold())
                            Text("Your paper gallery")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                        Spacer(minLength: 24)
                        VStack(spacing: 16) {
                            ForEach([OAuthProvider.github, .gitlab, .email], id: \.self) { provider in
                                SignInButton(
                                    provider: provider,
                                    isLoading: isStartingSignIn && activeProvider == provider,
                                    isDisabled: isStartingSignIn || authManager.isLoading,
                                    action: { signIn(with: provider) }
                                )
                            }
                        }
                        Link("Privacy Policy", destination: AuthManager.siteURL.appendingPathComponent("privacy"))
                            .font(.footnote)
                            .frame(minHeight: 44)
                        Spacer(minLength: 16)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                    .frame(maxWidth: 480)
                    .frame(minHeight: geometry.size.height, alignment: .center)
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .alert("Error", isPresented: Binding(
            get: { error != nil },
            set: { if !$0 { error = nil } }
        )) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "Unknown error")
        }
    }

    private func signIn(with provider: OAuthProvider) {
        guard !isStartingSignIn else { return }
        isStartingSignIn = true
        activeProvider = provider

        let request: MobileSignInRequest
        do { request = try MobileSignInRequest() }
        catch {
            self.error = error.localizedDescription
            isStartingSignIn = false
            activeProvider = nil
            return
        }
        let url = request.url(siteURL: AuthManager.siteURL, provider: provider.rawValue)

        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "carrel"
        ) { callbackURL, error in
            Task { @MainActor in
                self.authSession = nil
                defer {
                    self.isStartingSignIn = false
                    self.activeProvider = nil
                }

                if let error = error as? ASWebAuthenticationSessionError,
                   error.code == .canceledLogin {
                    return
                }

                if let error = error {
                    self.error = error.localizedDescription
                    return
                }

                guard let callbackURL else {
                    self.error = "Invalid sign-in response"
                    return
                }
                do { try await authManager.completeSignIn(callback: callbackURL, request: request) }
                catch { self.error = error.localizedDescription }

            }
        }

        session.prefersEphemeralWebBrowserSession = false
        session.presentationContextProvider = WebAuthContextProvider.shared
        authSession = session
        guard session.start() else {
            authSession = nil
            isStartingSignIn = false
            activeProvider = nil
            error = "Failed to start sign in"
            return
        }
    }
}

struct SignInButton: View {
    let provider: OAuthProvider
    let isLoading: Bool
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                }

                // Only show icon for email
                if provider == .email && !isLoading {
                    Image(systemName: provider.iconName)
                        .font(.title3)
                }

                Text("Sign in with \(provider.displayName)")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 12)
        }
        .buttonStyle(.glass)
        .foregroundStyle(.primary)
        .disabled(isDisabled)
    }
}

enum OAuthProvider: String {
    case github
    case gitlab
    case email

    var displayName: String {
        switch self {
        case .github: return "GitHub"
        case .gitlab: return "GitLab"
        case .email: return "Email"
        }
    }

    var iconName: String {
        switch self {
        case .github: return "network"
        case .gitlab: return "server.rack"
        case .email: return "envelope.fill"
        }
    }
}

#Preview {
    LoginView()
        .environment(AuthManager())
}
