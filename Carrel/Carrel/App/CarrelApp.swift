import SwiftUI

@main
struct CarrelApp: App {
    @State private var authManager = AuthManager()
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if hasCompletedOnboarding {
                    ContentView()
                } else {
                    OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                }
            }
            .environment(authManager)
            .task {
                // Start network monitoring
                NetworkMonitor.shared.start()
                await PushNotificationManager.shared.refreshAuthorizationStatus()
                HapticManager.prepare()
            }
            .onChange(of: scenePhase) { _, newPhase in
                guard newPhase == .active else { return }
                Task {
                    HapticManager.prepare()
                    await authManager.refreshSessionIfNeededOnAppActive()
                }
            }
        }
    }
}
