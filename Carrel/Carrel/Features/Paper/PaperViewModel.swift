import Foundation
import SwiftUI

@Observable
@MainActor
final class PaperViewModel {
    private(set) var paper: Paper
    private(set) var isLoading = false
    private(set) var error: String?
    private(set) var isBuilding = false
    private(set) var isTogglingPublic = false

    private let authManager: AuthManager
    private var client: ConvexClient {
        ConvexClient(baseURL: AuthManager.baseURL, authManager: authManager)
    }

    init(paper: Paper, authManager: AuthManager) {
        self.paper = paper
        self.authManager = authManager
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            paper = try await client.paper(id: paper.id)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func build(force: Bool = false) async {
        isBuilding = true

        // Trigger the build (fire and forget - returns immediately)
        do {
            try await client.buildPaper(id: paper.id, force: force)
        } catch {
            self.error = error.localizedDescription
            isBuilding = false
            return
        }

        // Poll for progress updates until build completes
        var attempts = 0
        let maxAttempts = 120 // 2 minutes max (120 * 1 second)

        while attempts < maxAttempts {
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            attempts += 1

            do {
                let updatedPaper = try await client.paper(id: paper.id)
                paper = updatedPaper

                // Stop polling if build completed
                if updatedPaper.buildStatus != "building" && updatedPaper.compilationProgress == nil {
                    break
                }
            } catch {
                // Ignore polling errors, keep trying
            }
        }

        isBuilding = false

        // Trigger haptic based on final status
        switch paper.status {
        case .synced:
            HapticManager.buildSuccess()
        case .error:
            HapticManager.buildError()
        default:
            break
        }
    }

    func updateMetadata(title: String?, authors: String?) async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await client.updatePaper(id: paper.id, title: title, authors: authors)
            await refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func togglePublic() async {
        isTogglingPublic = true
        defer { isTogglingPublic = false }

        do {
            let result = try await client.togglePaperPublic(id: paper.id)
            await refresh()
            _ = result // We refresh to get the full updated paper
        } catch {
            self.error = error.localizedDescription
        }
    }

    func clearError() {
        error = nil
    }
}
