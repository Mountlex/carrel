import Combine
import Foundation
import SwiftUI

@Observable
@MainActor
final class RepositoryViewModel: SubscribableViewModel {
    typealias SubscriptionData = [Repository]

    private(set) var repositories: [Repository] = []
    var isLoading = false
    var error: String?
    var subscriptionTask: Task<Void, Never>?
    var subscriptionStoppedAt: Date?

    /// The current user's ID, needed for the repositories subscription
    private var userId: String?

    /// ID of the repository currently being refreshed
    private(set) var refreshingRepoId: String?

    /// Whether a "Check All" operation is in progress
    private(set) var isCheckingAll = false

    /// Current toast message to display
    var toastMessage: ToastMessage?

    private var reposUpdatingBackgroundRefresh: Set<String> = []
    private var reposUpdatingCacheMode: Set<String> = []

    /// Whether background refresh is allowed (master pause)
    private(set) var isBackgroundRefreshAllowed = true

    /// Default background refresh setting for repo default
    private(set) var backgroundRefreshDefault = true

    /// Global compilation cache preference (from user settings)
    private(set) var userCacheMode: LatexCacheMode = .aux
    private(set) var isCompilationCacheAllowed = true

    deinit {
        Task { @MainActor [weak self] in
            self?.stopSubscription()
        }
    }

    // MARK: - SubscribableViewModel

    func setupBeforeSubscription() async throws {
        #if DEBUG
        print("RepositoryViewModel: Starting repositories subscription...")
        print("RepositoryViewModel: ConvexService isAuthenticated = \(ConvexService.shared.isAuthenticated)")
        #endif

        // Fetch the current user to get their userId
        guard let user = try await ConvexService.shared.getViewer() else {
            throw RepositoryViewModelError.notAuthenticated
        }

        #if DEBUG
        print("RepositoryViewModel: Got user ID: \(user.id)")
        #endif
        userId = user.id
        userCacheMode = user.latexCacheMode ?? .aux
        isCompilationCacheAllowed = user.latexCacheAllowed ?? true
        backgroundRefreshDefault = user.backgroundRefreshDefault ?? true
    }

    func createSubscriptionPublisher() -> AnyPublisher<[Repository], Error> {
        guard let userId = userId else {
            return Fail(error: RepositoryViewModelError.notAuthenticated)
                .eraseToAnyPublisher()
        }
        return ConvexService.shared.subscribeToRepositories(userId: userId)
            .mapError { $0 as Error }
            .eraseToAnyPublisher()
    }

    func handleSubscriptionData(_ data: [Repository]) {
        #if DEBUG
        // Only log if count changed
        if repositories.count != data.count {
            print("RepositoryViewModel: Repositories count changed: \(repositories.count) -> \(data.count)")
        }
        #endif
        repositories = data
    }

    private enum RepositoryViewModelError: Error, LocalizedError {
        case notAuthenticated

        var errorDescription: String? {
            switch self {
            case .notAuthenticated:
                return "Not authenticated"
            }
        }
    }

    // MARK: - Check All Repositories

    /// Check all repositories for updates
    func checkAllRepositories() async {
        guard !isCheckingAll else { return }

        isCheckingAll = true
        defer { isCheckingAll = false }

        do {
            let result = try await ConvexService.shared.checkAllRepositories()

            if result.failed > 0 {
                toastMessage = ToastMessage(text: "\(result.failed) repos failed", type: .error)
            } else if result.checked == 0 {
                toastMessage = ToastMessage(text: "All repos recently checked", type: .info)
            } else if result.updated > 0 {
                toastMessage = ToastMessage(text: "\(result.updated) repos updated", type: .success)
            } else {
                toastMessage = ToastMessage(text: "All repos up to date", type: .info)
            }
        } catch {
            toastMessage = ToastMessage(text: "Failed to check repos", type: .error)
        }
    }

    // MARK: - Repository Operations

    /// Refresh a single repository
    func refreshRepository(_ repository: Repository) async {
        guard refreshingRepoId == nil else { return }

        refreshingRepoId = repository.id
        defer { refreshingRepoId = nil }

        do {
            let result = try await ConvexService.shared.refreshRepository(id: repository.id)

            if result.skipped == true {
                toastMessage = ToastMessage(text: "Already syncing", type: .info)
            } else if result.updated {
                toastMessage = ToastMessage(text: "Repository updated", type: .success)
            } else {
                toastMessage = ToastMessage(text: "Already up to date", type: .info)
            }
        } catch {
            let message = error.localizedDescription.contains("Rate limit")
                ? "Rate limited, try later"
                : "Failed to refresh"
            toastMessage = ToastMessage(text: message, type: .error)
        }
    }

    /// Delete a repository (cascades to papers and tracked files)
    func deleteRepository(_ repository: Repository) async {
        do {
            try await ConvexService.shared.deleteRepository(id: repository.id)
            // With subscriptions, the repository list will update automatically
            toastMessage = ToastMessage(text: "Repository deleted", type: .success)
        } catch {
            self.error = error.localizedDescription
            toastMessage = ToastMessage(text: "Failed to delete", type: .error)
        }
    }

    /// Toggle background refresh for a repository
    func setBackgroundRefresh(repositoryId: String, enabled: Bool?) async -> Bool {
        let repoId = repositoryId
        if reposUpdatingBackgroundRefresh.contains(repoId) { return true }
        reposUpdatingBackgroundRefresh.insert(repoId)
        defer { reposUpdatingBackgroundRefresh.remove(repoId) }
        do {
            try await ConvexService.shared.setBackgroundRefresh(
                repositoryId: repoId,
                enabled: enabled
            )
            if let index = repositories.firstIndex(where: { $0.id == repoId }) {
                var updated = repositories
                updated[index] = updated[index].with(backgroundRefreshEnabled: enabled)
                repositories = updated
            }
            return true
        } catch {
            toastMessage = ToastMessage(text: "Failed to update background refresh", type: .error)
            return false
        }
    }

    /// Update compilation cache mode for a repository (nil = default)
    func setCompilationCacheMode(repositoryId: String, mode: LatexCacheMode?) async -> Bool {
        let repoId = repositoryId
        if reposUpdatingCacheMode.contains(repoId) { return true }
        reposUpdatingCacheMode.insert(repoId)
        defer { reposUpdatingCacheMode.remove(repoId) }
        do {
            try await ConvexService.shared.setRepositoryLatexCacheMode(
                repositoryId: repoId,
                mode: mode
            )
            if let index = repositories.firstIndex(where: { $0.id == repoId }) {
                var updated = repositories
                updated[index] = updated[index].with(latexCacheMode: mode)
                repositories = updated
            }
            return true
        } catch {
            toastMessage = ToastMessage(text: "Failed to update compilation cache", type: .error)
            return false
        }
    }

    func loadNotificationPreferences() async {
        do {
            let preferences = try await ConvexService.shared.getNotificationPreferences()
            isBackgroundRefreshAllowed = preferences.backgroundSync
        } catch {
            #if DEBUG
            print("RepositoryViewModel: Failed to load notification preferences: \(error)")
            #endif
        }
    }

    func loadUserCacheMode() async {
        do {
            let user = try await ConvexService.shared.getViewer()
            userCacheMode = user?.latexCacheMode ?? .aux
            isCompilationCacheAllowed = user?.latexCacheAllowed ?? true
            backgroundRefreshDefault = user?.backgroundRefreshDefault ?? true
        } catch {
            #if DEBUG
            print("RepositoryViewModel: Failed to load user cache mode: \(error)")
            #endif
        }
    }

    func clearError() {
        error = nil
    }

    func clearToast() {
        toastMessage = nil
    }
}
