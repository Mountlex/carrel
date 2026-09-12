import Foundation
import SwiftUI
import UIKit

@Observable
@MainActor
final class AuthManager {
    private(set) var isAuthenticated = false
    private(set) var isLoading = false
    private(set) var userID: String?
    private(set) var isUsingCachedSession = false
    private var accessToken: String?
    private var refreshTask: Task<Bool, Never>?
    private var revocationTask: Task<Void, Never>?
    private var tokenMonitorTask: Task<Void, Never>?
    private var sessionGeneration = 0
    private let keychain = KeychainManager.shared

    static let siteURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "CarrelSiteURL") as? String ?? "https://carrelapp.com")!
    static let convexHTTPURL = URL(string: (Bundle.main.object(forInfoDictionaryKey: "ConvexDeploymentURL") as? String ?? "https://kindhearted-bloodhound-95.convex.cloud")
        .replacingOccurrences(of: ".convex.cloud", with: ".convex.site"))!

    func loadStoredTokens() async {
        retryPendingRevocations()
        guard !isLoading else { return }
        let generation = sessionGeneration
        isLoading = true
        defer { if generation == sessionGeneration { isLoading = false } }
        guard let token = await keychain.loadConvexAuthToken(),
              let claims = SessionToken(token), generation == sessionGeneration else { return }
        accessToken = token
        userID = claims.userID

        // Local documents remain readable offline even when the server session needs renewal.
        if !NetworkMonitor.shared.isConnected {
            let papers = await LibraryStore.shared.load(accountID: claims.userID)
            guard generation == sessionGeneration else { return }
            isAuthenticated = !papers.isEmpty || claims.expiresAt > Date()
            isUsingCachedSession = isAuthenticated
            startTokenMonitor()
            return
        }
        if claims.expiresAt.timeIntervalSinceNow < 300 {
            if await refreshTokenSilently() { return }
            // A path update can arrive during the first refresh attempt at launch.
            // Transient connection failures should not hide already saved papers.
            guard generation == sessionGeneration else { return }
            if claims.expiresAt <= Date() {
                let papers = await LibraryStore.shared.load(accountID: claims.userID)
                guard generation == sessionGeneration else { return }
                isAuthenticated = !papers.isEmpty
                isUsingCachedSession = isAuthenticated
                startTokenMonitor()
                return
            }
        }
        guard generation == sessionGeneration else { return }
        let authenticated = await ConvexService.shared.setAuthToken(token)
        guard generation == sessionGeneration else { return }
        isAuthenticated = authenticated
        isUsingCachedSession = !authenticated
        if authenticated { startTokenMonitor() }
    }

    func refreshSessionIfNeededOnAppActive() async {
        retryPendingRevocations()
        guard NetworkMonitor.shared.isConnected, !isLoading else { return }
        guard let token = accessToken, let claims = SessionToken(token) else {
            await loadStoredTokens()
            return
        }
        if claims.expiresAt.timeIntervalSinceNow < 300 {
            _ = await refreshTokenSilently()
        } else if !ConvexService.shared.isAuthenticated {
            let generation = sessionGeneration
            let authenticated = await ConvexService.shared.setAuthToken(token)
            guard generation == sessionGeneration else { return }
            if authenticated {
                isAuthenticated = true
                isUsingCachedSession = false
            }
        }
    }

    func refreshTokenSilently() async -> Bool {
        if let refreshTask { return await refreshTask.value }
        let generation = sessionGeneration
        let task = Task { [weak self] in
            guard let self else { return false }
            do {
                guard let refreshToken = await keychain.loadRefreshToken() else { return false }
                let response: TokenResponse = try await Self.request("api/mobile/refresh", body: ["refreshToken": refreshToken])
                try await apply(response, generation: generation)
                return true
            } catch let error as SessionError {
                if error == .expired, generation == sessionGeneration {
                    await logout(revokeRemoteSession: false)
                }
                return false
            } catch { return false }
        }
        refreshTask = task
        let result = await task.value
        if generation == sessionGeneration { refreshTask = nil }
        return result
    }

    func completeSignIn(callback: URL, request: MobileSignInRequest) async throws {
        guard !isLoading else { throw SessionError.busy }
        let generation = sessionGeneration
        isLoading = true
        defer { if generation == sessionGeneration { isLoading = false } }
        let code = try request.authorizationCode(from: callback)
        let response: TokenResponse = try await Self.request("api/mobile/token", body: [
            "code": code, "codeVerifier": request.verifier,
            "deviceId": UIDevice.current.identifierForVendor?.uuidString ?? "ios"
        ])
        try await apply(response, generation: generation)
    }

    private func apply(_ response: TokenResponse, generation: Int) async throws {
        try Task.checkCancellation()
        guard generation == sessionGeneration, let claims = SessionToken(response.accessToken), claims.expiresAt > Date() else {
            throw SessionError.expired
        }
        try await keychain.saveSession(accessToken: response.accessToken, refreshToken: response.refreshToken)
        try Task.checkCancellation()
        guard generation == sessionGeneration else { throw CancellationError() }
        let authenticated = await ConvexService.shared.setAuthToken(response.accessToken)
        try Task.checkCancellation()
        guard generation == sessionGeneration else { throw CancellationError() }
        guard authenticated else { throw SessionError.connection }
        accessToken = response.accessToken
        userID = claims.userID
        isAuthenticated = true
        isUsingCachedSession = false
        startTokenMonitor()
    }

    func logout(revokeRemoteSession: Bool = true) async {
        sessionGeneration += 1
        tokenMonitorTask?.cancel()
        tokenMonitorTask = nil
        refreshTask?.cancel()
        refreshTask = nil
        isLoading = true
        let previousAccount = userID
        let refreshToken = await keychain.loadRefreshToken()
        if revokeRemoteSession, let refreshToken { try? await keychain.enqueueRevocation(refreshToken) }
        // Clear local access immediately; queued remote revocation can finish after reconnecting.
        isAuthenticated = false
        isUsingCachedSession = false
        accessToken = nil
        userID = nil
        PushNotificationManager.shared.setAuthenticated(false)
        await keychain.clearAllTokens()
        await ConvexService.shared.clearAuth()
        await LibraryStore.shared.clear(accountID: previousAccount)
        await PDFCache.shared.clearCache()
        await ThumbnailCache.shared.clearCache()
        isLoading = false
        retryPendingRevocations()
    }

    private func retryPendingRevocations() {
        guard NetworkMonitor.shared.isConnected, revocationTask == nil else { return }
        revocationTask = Task { [weak self] in
            guard let self else { return }
            defer { revocationTask = nil }
            for token in await keychain.pendingRevocations() {
                do {
                    let _: RevokeResponse = try await Self.request("api/mobile/revoke", body: ["refreshToken": token])
                    try await keychain.finishRevocation(token)
                } catch { return }
            }
        }
    }

    private func startTokenMonitor() {
        guard tokenMonitorTask == nil else { return }
        tokenMonitorTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                guard let self else { return }
                await self.refreshSessionIfNeededOnAppActive()
            }
        }
    }

    private static func request<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        var request = URLRequest(url: convexHTTPURL.appendingPathComponent(path), timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw SessionError.connection }
        if [400, 401, 403].contains(response.statusCode) { throw SessionError.expired }
        guard (200...299).contains(response.statusCode) else { throw SessionError.connection }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

nonisolated struct SessionToken {
    let userID: String
    let expiresAt: Date
    init?(_ token: String) {
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let data = Data(base64Encoded: payload),
              let claims = try? JSONDecoder().decode(Claims.self, from: data),
              let userID = claims.sub.split(separator: "|").first, !userID.isEmpty else { return nil }
        self.userID = String(userID)
        expiresAt = Date(timeIntervalSince1970: claims.exp)
    }
    private struct Claims: Decodable { let sub: String; let exp: Double }
}

nonisolated private struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
}
nonisolated private struct RevokeResponse: Decodable { let success: Bool }
nonisolated enum SessionError: Error, LocalizedError {
    case expired, connection, busy, invalidCallback
    var errorDescription: String? {
        switch self {
        case .expired: "Your session has expired. Please sign in again."
        case .connection: "Unable to connect. Check your connection and try again."
        case .busy: "Please wait for the current account operation to finish."
        case .invalidCallback: "The sign-in response could not be verified. Please try again."
        }
    }
}
