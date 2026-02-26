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
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                GalleryView()
            }
            .tabItem {
                Label("Papers", systemImage: "doc.text.fill")
            }

            NavigationStack {
                RepositoryListView()
            }
            .tabItem {
                Label("Repositories", systemImage: "folder.fill")
            }

            NavigationStack {
                SettingsView()
            }
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
    @State private var showBanner = false

    var body: some View {
        Group {
            if showBanner {
                OfflineBanner()
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(GlassTheme.quickMotion, value: showBanner)
        .task {
            // Initial state
            showBanner = !NetworkMonitor.shared.isConnected
        }
        .onReceive(NotificationCenter.default.publisher(for: .networkStatusChanged)) { notification in
            if let isConnected = notification.object as? Bool {
                showBanner = !isConnected
            }
        }
    }
}

#Preview {
    ContentView()
        .environment(AuthManager())
}
