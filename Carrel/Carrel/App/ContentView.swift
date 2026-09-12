import SwiftUI

struct ContentView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var hasCheckedStoredTokens = false

    var body: some View {
        Group {
            if !hasCheckedStoredTokens {
                ZStack {
                    Color(uiColor: .systemBackground)
                        .ignoresSafeArea()
                    ProgressView()
                }
            } else if authManager.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .task {
            guard !hasCheckedStoredTokens else { return }
            await authManager.loadStoredTokens()
            PushNotificationManager.shared.setAuthenticated(authManager.isAuthenticated)
            hasCheckedStoredTokens = true
        }
        .onChange(of: authManager.isAuthenticated) { _, isAuthenticated in
            PushNotificationManager.shared.setAuthenticated(isAuthenticated)
        }
        .onReceive(NotificationCenter.default.publisher(for: .networkStatusChanged)) { notification in
            guard let isConnected = notification.object as? Bool, isConnected else { return }
            Task {
                await authManager.refreshSessionIfNeededOnAppActive()
            }
        }
    }
}

struct MainTabView: View {
    @Environment(AppNavigationCoordinator.self) private var appNavigation

    var body: some View {
        TabView(selection: Binding(
            get: { appNavigation.selectedTab },
            set: { appNavigation.selectedTab = $0 }
        )) {
            NavigationStack {
                GalleryView()
            }
            .tag(AppNavigationCoordinator.Tab.papers)
            .tabItem {
                Label("Papers", systemImage: "doc.text.fill")
            }

            NavigationStack {
                RepositoryListView()
            }
            .tag(AppNavigationCoordinator.Tab.repositories)
            .tabItem {
                Label("Repositories", systemImage: "folder.fill")
            }

            NavigationStack {
                SettingsView()
            }
            .tag(AppNavigationCoordinator.Tab.settings)
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
        }
        .tint(GlassTheme.accent)
        .overlay(alignment: .top) {
            OfflineBannerOverlay()
        }
    }
}

/// Separate view for offline banner to isolate observation
private struct OfflineBannerOverlay: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var showBanner: Bool { !NetworkMonitor.shared.isConnected || authManager.isUsingCachedSession }

    var body: some View {
        Group {
            if showBanner {
                OfflineBanner(message: NetworkMonitor.shared.isConnected ? "Showing saved papers" : "No internet connection")
                    .transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : GlassTheme.quickMotion, value: showBanner)
    }
}

#Preview {
    ContentView()
        .environment(AuthManager())
}
