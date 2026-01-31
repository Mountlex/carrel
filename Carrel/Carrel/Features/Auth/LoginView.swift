import SwiftUI

struct LoginView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var showingOAuth = false
    @State private var showingEmailSignIn = false
    @State private var selectedProvider: OAuthProvider?

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(red: 0.1, green: 0.1, blue: 0.2),
                    Color(red: 0.15, green: 0.15, blue: 0.25)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                // Logo and title with glass backing
                VStack(spacing: 16) {
                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.white)

                    Text("Carrel")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text("Your paper gallery")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                }

                Spacer()

                // Sign in buttons with unified glass sampling
                GlassEffectContainer {
                    VStack(spacing: 16) {
                        SignInButton(
                            provider: .github,
                            action: { signIn(with: .github) }
                        )

                        SignInButton(
                            provider: .gitlab,
                            action: { signIn(with: .gitlab) }
                        )

                        // Divider
                        HStack {
                            Rectangle()
                                .fill(.white.opacity(0.3))
                                .frame(height: 1)
                            Text("or")
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.6))
                            Rectangle()
                                .fill(.white.opacity(0.3))
                                .frame(height: 1)
                        }

                        // Email sign in button
                        Button {
                            showingEmailSignIn = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "envelope.fill")
                                    .font(.title3)

                                Text("Sign in with Email")
                                    .font(.headline)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                        }
                        .buttonStyle(.liquidGlass)
                        .foregroundStyle(.white)
                    }
                }
                .padding(.horizontal, 32)

                Spacer()
                    .frame(height: 60)
            }
        }
        .sheet(isPresented: $showingOAuth) {
            if let provider = selectedProvider {
                OAuthWebView(provider: provider) { tokens in
                    Task {
                        await authManager.handleOAuthCallback(tokens: tokens)
                    }
                    showingOAuth = false
                }
            }
        }
        .sheet(isPresented: $showingEmailSignIn) {
            EmailSignInView()
        }
    }

    private func signIn(with provider: OAuthProvider) {
        selectedProvider = provider
        showingOAuth = true
    }
}

struct SignInButton: View {
    let provider: OAuthProvider
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: provider.iconName)
                    .font(.title3)

                Text("Sign in with \(provider.displayName)")
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
        .buttonStyle(.liquidGlass)
        .foregroundStyle(.white)
    }
}

struct EmailSignInView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var isSignUp = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()

                    SecureField("Password", text: $password)
                        .textContentType(isSignUp ? .newPassword : .password)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task {
                            await submit()
                        }
                    } label: {
                        HStack {
                            Spacer()
                            if isLoading {
                                ProgressView()
                            } else {
                                Text(isSignUp ? "Create Account" : "Sign In")
                            }
                            Spacer()
                        }
                    }
                    .disabled(email.isEmpty || password.isEmpty || isLoading)
                }

                Section {
                    Button {
                        isSignUp.toggle()
                        errorMessage = nil
                    } label: {
                        Text(isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up")
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(isSignUp ? "Create Account" : "Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func submit() async {
        isLoading = true
        errorMessage = nil

        do {
            if isSignUp {
                try await authManager.signUpWithEmail(email: email, password: password)
            } else {
                try await authManager.signInWithEmail(email: email, password: password)
            }
            dismiss()
        } catch let error as APIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

enum OAuthProvider: String {
    case github
    case gitlab

    var displayName: String {
        switch self {
        case .github: return "GitHub"
        case .gitlab: return "GitLab"
        }
    }

    var iconName: String {
        switch self {
        case .github: return "network"
        case .gitlab: return "server.rack"
        }
    }
}

#Preview {
    LoginView()
        .environment(AuthManager())
}
