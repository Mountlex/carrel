import Foundation

@Observable
@MainActor
final class AppNavigationCoordinator {
    static let shared = AppNavigationCoordinator()

    enum Tab: Hashable {
        case papers
        case repositories
        case settings
    }

    var selectedTab: Tab = .papers
    private(set) var pendingPaperID: String?

    private init() {}

    func openPaper(id: String) {
        selectedTab = .papers
        pendingPaperID = id
    }

    func consumePendingPaper(id: String) {
        guard pendingPaperID == id else { return }
        pendingPaperID = nil
    }
}
