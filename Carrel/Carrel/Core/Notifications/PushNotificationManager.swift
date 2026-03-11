import Foundation
import SwiftUI
import UserNotifications
import UIKit

@Observable
@MainActor
final class PushNotificationManager {
    static let shared = PushNotificationManager()
    private static let notificationsEnabledKey = "notifications_enabled"

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private var deviceToken: String?
    private var lastRegisteredToken: String?
    private var isAuthenticated = false
    private var notificationsEnabled = UserDefaults.standard.object(
        forKey: PushNotificationManager.notificationsEnabledKey
    ) as? Bool ?? false

    private init() {}

    private var apnsEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        if notificationsEnabled,
           (settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional) {
            registerForRemoteNotifications()
        }
    }

    func currentAuthorizationStatus() async -> UNAuthorizationStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        return settings.authorizationStatus
    }

    func requestAuthorization() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus

        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
            guard notificationsEnabled else { return true }
            registerForRemoteNotifications()
            return true
        }

        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            await refreshAuthorizationStatus()
            if granted, notificationsEnabled {
                registerForRemoteNotifications()
            }
            return granted
        } catch {
            return false
        }
    }

    func setNotificationsEnabled(_ enabled: Bool) {
        notificationsEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.notificationsEnabledKey)

        if enabled {
            Task {
                await refreshAuthorizationStatus()
                await registerTokenIfPossible()
            }
        } else {
            Task {
                await unregisterDeviceToken()
            }
        }
    }

    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func setAuthenticated(_ authenticated: Bool) {
        isAuthenticated = authenticated
        if !authenticated {
            // Force fresh registration on next login.
            lastRegisteredToken = nil
            return
        }

        Task {
            await refreshAuthorizationStatus()
            await registerTokenIfPossible()
        }
    }

    func updateDeviceToken(_ data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        deviceToken = token
        Task { await registerTokenIfPossible() }
    }

    func unregisterDeviceToken() async {
        guard let token = lastRegisteredToken ?? deviceToken else { return }
        do {
            try await ConvexService.shared.unregisterDeviceToken(token)
            lastRegisteredToken = nil
        } catch {
            #if DEBUG
            print("PushNotificationManager: Failed to unregister token: \(error)")
            #endif
        }
    }

    func handleSilentNotification(userInfo: [AnyHashable: Any]) async -> Bool {
        guard isAuthenticated else { return false }
        guard let aps = userInfo["aps"] as? [String: Any],
              aps["content-available"] as? Int == 1 else {
            return false
        }

        do {
            _ = try await ConvexService.shared.refreshPapersOnce()
            return true
        } catch {
            #if DEBUG
            print("PushNotificationManager: Background refresh failed: \(error)")
            #endif
            return false
        }
    }

    func handleNotificationResponse(userInfo: [AnyHashable: Any]) {
        guard let paperID = notificationPaperID(from: userInfo) else { return }
        AppNavigationCoordinator.shared.openPaper(id: paperID)
    }

    private func registerTokenIfPossible() async {
        guard isAuthenticated, notificationsEnabled else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            return
        }

        guard let token = deviceToken else {
            registerForRemoteNotifications()
            return
        }

        if token == lastRegisteredToken {
            return
        }

        do {
            let deviceId = UIDevice.current.identifierForVendor?.uuidString
            try await ConvexService.shared.registerDeviceToken(
                token,
                platform: "ios",
                environment: apnsEnvironment,
                deviceId: deviceId,
                appVersion: nil
            )
            lastRegisteredToken = token
        } catch {
            #if DEBUG
            print("PushNotificationManager: Failed to register token: \(error)")
            #endif
        }
    }

    private func notificationPaperID(from userInfo: [AnyHashable: Any]) -> String? {
        if let paperID = userInfo["paperId"] as? String {
            return paperID
        }

        if let data = userInfo["data"] as? [String: Any],
           let paperID = data["paperId"] as? String {
            return paperID
        }

        if let data = userInfo["data"] as? [String: AnyHashable],
           let paperID = data["paperId"] as? String {
            return paperID
        }

        return nil
    }
}
