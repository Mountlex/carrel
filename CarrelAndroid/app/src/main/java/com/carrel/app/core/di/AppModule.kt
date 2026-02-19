package com.carrel.app.core.di

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.carrel.app.core.auth.AuthManager
import com.carrel.app.core.auth.OAuthHandler
import com.carrel.app.core.auth.TokenStorage
import com.carrel.app.core.network.ConvexClient
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.NetworkMonitor
import com.carrel.app.core.notifications.PushNotificationManager
import com.carrel.app.core.onboarding.OnboardingManager

class AppContainer(
    val authManager: AuthManager,
    val convexClient: ConvexClient,
    val convexService: ConvexService,
    val oAuthHandler: OAuthHandler,
    val onboardingManager: OnboardingManager,
    val networkMonitor: NetworkMonitor,
    val pushNotificationManager: PushNotificationManager
)

fun appModule(context: Context): AppContainer {
    val tokenStorage = TokenStorage(context)

    // Get device info for token exchange
    val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        ?: "unknown"
    val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"

    val authManager = AuthManager(tokenStorage, deviceId, deviceName)
    val convexClient = ConvexClient(authManager)
    val convexService = ConvexService(context)
    val oAuthHandler = OAuthHandler(context)
    val onboardingManager = OnboardingManager(context)
    val networkMonitor = NetworkMonitor.getInstance(context).also { it.start() }
    val pushNotificationManager = PushNotificationManager(context, convexService)

    return AppContainer(
        authManager = authManager,
        convexClient = convexClient,
        convexService = convexService,
        oAuthHandler = oAuthHandler,
        onboardingManager = onboardingManager,
        networkMonitor = networkMonitor,
        pushNotificationManager = pushNotificationManager
    )
}
