package com.carrel.app.core.auth

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import com.carrel.app.core.network.ConvexClient

enum class OAuthProvider(val id: String?, val displayName: String) {
    GITHUB("github", "GitHub"),
    GITLAB("gitlab", "GitLab"),
    EMAIL(null, "Email")  // null means no provider param - shows full auth page
}

class OAuthHandler(private val context: Context) {

    fun launchOAuth(provider: OAuthProvider) {
        val uriBuilder = Uri.parse("${ConvexClient.SITE_URL}/mobile-auth").buildUpon()

        // Only add provider param for OAuth providers, not email
        provider.id?.let {
            uriBuilder.appendQueryParameter("provider", it)
        }

        val uri = uriBuilder.build()

        val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()

        customTabsIntent.launchUrl(context, uri)
    }

    companion object {
        fun parseCallbackUri(uri: Uri): OAuthCallbackResult? {
            if (uri.scheme != "carrel" || uri.host != "auth") {
                return null
            }

            val accessToken = uri.getQueryParameter("accessToken") ?: return null
            val expiresAt = uri.getQueryParameter("expiresAt")?.toLongOrNull() ?: return null

            return OAuthCallbackResult(
                accessToken = accessToken,
                refreshToken = uri.getQueryParameter("refreshToken"),
                expiresAt = expiresAt,
                refreshExpiresAt = uri.getQueryParameter("refreshExpiresAt")?.toLongOrNull()
            )
        }
    }
}

data class OAuthCallbackResult(
    val accessToken: String,
    val refreshToken: String?,
    val expiresAt: Long,
    val refreshExpiresAt: Long?
)
