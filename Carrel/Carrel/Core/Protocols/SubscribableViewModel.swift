import Combine
import Foundation

/// Runs inside a SwiftUI `.task`, so leaving the view cancels setup and live updates.
@MainActor
protocol SubscribableViewModel: AnyObject {
    associatedtype SubscriptionData
    var isLoading: Bool { get set }
    var error: String? { get set }
    func setupBeforeSubscription() async throws
    func createSubscriptionPublisher() -> AnyPublisher<SubscriptionData, Error>
    func handleSubscriptionData(_ data: SubscriptionData)
}

extension SubscribableViewModel {
    func setupBeforeSubscription() async throws {}

    func runSubscription() async {
        defer { isLoading = false }
        while !Task.isCancelled {
            // Preserve the offline snapshot until the connection has authenticated.
            guard NetworkMonitor.shared.isConnected, ConvexService.shared.isAuthenticated else {
                isLoading = false
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                continue
            }
            isLoading = true
            do {
                try await setupBeforeSubscription()
                try Task.checkCancellation()
                for try await data in createSubscriptionPublisher().values {
                    try Task.checkCancellation()
                    handleSubscriptionData(data)
                    isLoading = false
                    error = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
            isLoading = false
            do { try await Task.sleep(for: .seconds(5)) } catch { return }
        }
    }
}
