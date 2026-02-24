package com.carrel.app.core.notifications

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.carrel.app.BuildConfig
import com.carrel.app.core.network.ConvexService
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PushNotificationManager(
    private val context: Context,
    private val convexService: ConvexService,
    private val deviceId: String
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var isAuthenticated = false
    private var deviceToken: String? = null
    private var lastRegisteredToken: String? = null

    fun setAuthenticated(authenticated: Boolean) {
        isAuthenticated = authenticated
        if (!authenticated) {
            lastRegisteredToken = null
            return
        }
        fetchCurrentToken()
    }

    fun updateDeviceToken(token: String) {
        deviceToken = token
        registerTokenIfPossible()
    }

    fun unregisterDeviceToken() {
        val token = lastRegisteredToken ?: deviceToken ?: return
        scope.launch {
            convexService.unregisterDeviceToken(token)
                .onSuccess {
                    lastRegisteredToken = null
                    Log.d(TAG, "Device token unregistered")
                }
                .onFailure { e ->
                    Log.w(TAG, "Failed to unregister device token", e)
                }
        }
    }

    fun fetchCurrentToken() {
        scope.launch {
            registerCurrentTokenNow()
                .onFailure { e ->
                    Log.w(TAG, "Failed to fetch/register FCM token", e)
                }
        }
    }

    suspend fun registerCurrentTokenNow(): Result<Unit> {
        if (!isAuthenticated) {
            return Result.failure(IllegalStateException("User is not authenticated"))
        }
        if (!ensureFirebaseInitialized()) {
            return Result.failure(IllegalStateException("Firebase is not configured"))
        }
        if (!hasNotificationPermission()) {
            return Result.failure(IllegalStateException("Notification permission not granted"))
        }

        return runCatching {
            val token = getFirebaseToken()
            deviceToken = token
            if (token == lastRegisteredToken) return@runCatching

            val environment = if (BuildConfig.DEBUG) "sandbox" else "production"
            convexService.registerDeviceToken(
                token = token,
                platform = "android",
                environment = environment,
                deviceId = deviceId,
                appVersion = BuildConfig.VERSION_NAME
            ).getOrThrow()
            lastRegisteredToken = token
            Log.d(TAG, "Device token registered")
        }
    }

    private fun ensureFirebaseInitialized(): Boolean {
        return try {
            if (FirebaseApp.getApps(context).isNotEmpty()) {
                true
            } else {
                FirebaseApp.initializeApp(context) != null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Unable to initialize Firebase", e)
            false
        }
    }

    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun registerTokenIfPossible() {
        if (!isAuthenticated || !hasNotificationPermission()) return
        val token = deviceToken ?: return
        if (token == lastRegisteredToken) return

        val environment = if (BuildConfig.DEBUG) "sandbox" else "production"

        scope.launch {
            convexService.registerDeviceToken(
                token = token,
                platform = "android",
                environment = environment,
                deviceId = deviceId,
                appVersion = BuildConfig.VERSION_NAME
            ).onSuccess {
                lastRegisteredToken = token
                Log.d(TAG, "Device token registered")
            }.onFailure { e ->
                Log.w(TAG, "Failed to register device token", e)
            }
        }
    }

    private suspend fun getFirebaseToken(): String {
        return suspendCancellableCoroutine { continuation ->
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (continuation.isActive) continuation.resume(token)
                }
                .addOnFailureListener { error ->
                    if (continuation.isActive) continuation.resumeWithException(error)
                }
        }
    }

    companion object {
        private const val TAG = "PushNotificationManager"
    }
}
