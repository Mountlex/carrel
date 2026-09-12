import Foundation
import Network

extension Notification.Name {
    static let networkStatusChanged = Notification.Name("networkStatusChanged")
}

/// Monitors network connectivity status using NWPathMonitor.
/// Use the shared instance to check connectivity throughout the app.
@Observable
@MainActor
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    /// Whether the device currently has network connectivity
    private(set) var isConnected = true

    /// Whether the connection is expensive (cellular)
    private(set) var isExpensive = false

    /// Whether the connection is constrained (Low Data Mode)
    private(set) var isConstrained = false

    private var monitor: NWPathMonitor?
    private let queue = DispatchQueue(label: "com.carrel.NetworkMonitor")
    private var generation = 0
    private var isStarted = false
    private var debounceTask: Task<Void, Never>?

    private init() {}

    /// Start monitoring network status. Call this once at app launch.
    func start() {
        guard !isStarted else { return }
        isStarted = true
        generation += 1
        let monitorGeneration = generation
        let monitor = NWPathMonitor()
        self.monitor = monitor

        monitor.pathUpdateHandler = { [weak self] path in
            let newIsConnected = path.status == .satisfied
            let newIsExpensive = path.isExpensive
            let newIsConstrained = path.isConstrained

            Task { @MainActor [weak self] in
                guard let self, self.isStarted, self.generation == monitorGeneration else { return }
                self.debounceTask?.cancel()
                self.debounceTask = Task { @MainActor [weak self] in
                    // Small delay to debounce rapid state changes
                    try? await Task.sleep(for: .milliseconds(100))
                    guard !Task.isCancelled, let self, self.isStarted, self.generation == monitorGeneration else { return }

                    // Only update if values actually changed
                    if self.isConnected != newIsConnected {
                        self.isConnected = newIsConnected
                        // Post notification for views that prefer NotificationCenter over observation
                        NotificationCenter.default.post(name: .networkStatusChanged, object: newIsConnected)
                    }
                    if self.isExpensive != newIsExpensive {
                        self.isExpensive = newIsExpensive
                    }
                    if self.isConstrained != newIsConstrained {
                        self.isConstrained = newIsConstrained
                    }
                }
            }
        }
        monitor.start(queue: queue)
    }

    /// Stop monitoring. Call when no longer needed (typically never for app-wide monitor).
    func stop() {
        monitor?.cancel()
        monitor = nil
        debounceTask?.cancel()
        isStarted = false
    }
}
