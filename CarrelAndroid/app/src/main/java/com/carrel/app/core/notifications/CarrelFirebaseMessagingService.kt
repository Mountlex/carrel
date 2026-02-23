package com.carrel.app.core.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.carrel.app.CarrelApplication
import com.carrel.app.MainActivity
import com.carrel.app.R
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class CarrelFirebaseMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        (application as? CarrelApplication)
            ?.container
            ?.pushNotificationManager
            ?.updateDeviceToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (isSilentMessage(message)) {
            handleSilentMessage()
            return
        }

        val data = message.data
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"] ?: defaultBodyForEvent(data["event"])

        ensureChannel()
        if (!hasNotificationPermission()) {
            Log.d(TAG, "Skipping notification display due to missing permission")
            if (data["event"] == "paper_updated") {
                handleSilentMessage()
            }
            return
        }

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            NotificationManagerCompat.from(this).notify(
                (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
                notification
            )
        }

        if (data["event"] == "paper_updated") {
            handleSilentMessage()
        }
    }

    private fun isSilentMessage(message: RemoteMessage): Boolean {
        if (message.notification != null) return false

        val data = message.data
        if (data.isEmpty()) return true

        return data["pushType"] == "background" ||
            data["silent"] == "1" ||
            data["silent"] == "true" ||
            data["content-available"] == "1" ||
            data["content_available"] == "1" ||
            (data["event"] == "paper_updated" && data["title"].isNullOrBlank() && data["body"].isNullOrBlank())
    }

    private fun handleSilentMessage() {
        val container = (application as? CarrelApplication)?.container ?: return
        serviceScope.launch {
            container.convexService.refreshPapersOnce()
                .onFailure { error ->
                    Log.d(TAG, "Silent refresh skipped: ${error.message}")
                }
        }
    }

    private fun defaultBodyForEvent(event: String?): String {
        return when (event) {
            "test_notification" -> "Notifications are working."
            "paper_updated" -> "A tracked paper has new changes."
            "build_completed" -> "A paper build finished."
            else -> ""
        }
    }

    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun ensureChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Carrel Updates",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Build and repository updates from Carrel"
            }
        )
    }

    companion object {
        private const val CHANNEL_ID = "carrel_updates"
        private const val TAG = "CarrelFcmService"
    }
}
