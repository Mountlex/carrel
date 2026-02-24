package com.carrel.app.core.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.carrel.app.core.network.models.AuthTokens

class TokenStorage(context: Context) {
    private val prefs: SharedPreferences = createPreferences(context)

    private fun createPreferences(context: Context): SharedPreferences {
        return runCatching {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                ENCRYPTED_PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }.getOrElse { error ->
            Log.e(TAG, "Encrypted prefs unavailable, falling back to standard prefs", error)
            context.getSharedPreferences(FALLBACK_PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    // MARK: - JWT Token Storage (for email/password login)

    fun save(tokens: AuthTokens) {
        edit {
            putString(KEY_ACCESS_TOKEN, tokens.accessToken)
            putString(KEY_REFRESH_TOKEN, tokens.refreshToken)
            putLong(KEY_EXPIRES_AT, tokens.expiresAt)
            putLong(KEY_REFRESH_EXPIRES_AT, tokens.refreshExpiresAt ?: 0L)
        }
    }

    fun load(): StoredTokens? {
        val accessToken = read(default = null) { getString(KEY_ACCESS_TOKEN, null) } ?: return null
        val expiresAt = read(default = 0L) { getLong(KEY_EXPIRES_AT, 0L) }
        if (expiresAt == 0L) return null

        return StoredTokens(
            accessToken = accessToken,
            refreshToken = read(default = null) { getString(KEY_REFRESH_TOKEN, null) },
            accessTokenExpiry = expiresAt,
            refreshTokenExpiry = read(default = 0L) { getLong(KEY_REFRESH_EXPIRES_AT, 0L) }
                .takeIf { it > 0 }
        )
    }

    fun clear() {
        edit {
            remove(KEY_ACCESS_TOKEN)
            remove(KEY_REFRESH_TOKEN)
            remove(KEY_EXPIRES_AT)
            remove(KEY_REFRESH_EXPIRES_AT)
        }
    }

    // MARK: - Convex Auth Token Storage (for OAuth login)

    fun saveConvexAuthToken(token: String, expiresAt: Long? = null) {
        edit {
            putString(KEY_CONVEX_AUTH_TOKEN, token)
            if (expiresAt != null) {
                putLong(KEY_CONVEX_AUTH_EXPIRES_AT, expiresAt)
            }
        }
    }

    fun loadConvexAuthToken(): String? {
        return read(default = null) { getString(KEY_CONVEX_AUTH_TOKEN, null) }
    }

    fun loadConvexAuthExpiresAt(): Long {
        return read(default = 0L) { getLong(KEY_CONVEX_AUTH_EXPIRES_AT, 0L) }
    }

    fun clearConvexAuthToken() {
        edit {
            remove(KEY_CONVEX_AUTH_TOKEN)
            remove(KEY_CONVEX_AUTH_EXPIRES_AT)
        }
    }

    // MARK: - Convex Refresh Token Storage

    fun saveConvexRefreshToken(token: String) {
        edit {
            putString(KEY_CONVEX_REFRESH_TOKEN, token)
        }
    }

    fun loadConvexRefreshToken(): String? {
        return read(default = null) { getString(KEY_CONVEX_REFRESH_TOKEN, null) }
    }

    fun clearConvexRefreshToken() {
        edit {
            remove(KEY_CONVEX_REFRESH_TOKEN)
        }
    }

    fun clearAll() {
        edit { clear() }
    }

    private inline fun <T> read(default: T, block: SharedPreferences.() -> T): T {
        return runCatching {
            prefs.block()
        }.getOrElse { error ->
            Log.e(TAG, "TokenStorage read failed", error)
            default
        }
    }

    private inline fun edit(block: SharedPreferences.Editor.() -> Unit) {
        runCatching {
            prefs.edit().apply(block).apply()
        }.onFailure { error ->
            Log.e(TAG, "TokenStorage write failed", error)
        }
    }

    companion object {
        private const val TAG = "TokenStorage"
        private const val ENCRYPTED_PREFS_NAME = "carrel_tokens"
        private const val FALLBACK_PREFS_NAME = "carrel_tokens_fallback"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_REFRESH_EXPIRES_AT = "refresh_expires_at"
        private const val KEY_CONVEX_AUTH_TOKEN = "convex_auth_token"
        private const val KEY_CONVEX_AUTH_EXPIRES_AT = "convex_auth_expires_at"
        private const val KEY_CONVEX_REFRESH_TOKEN = "convex_refresh_token"
    }
}

data class StoredTokens(
    val accessToken: String,
    val refreshToken: String?,
    val accessTokenExpiry: Long,
    val refreshTokenExpiry: Long?
) {
    val isAccessTokenValid: Boolean
        get() = accessTokenExpiry > System.currentTimeMillis() + 60_000 // 1 minute buffer

    val isRefreshTokenValid: Boolean
        get() = refreshTokenExpiry?.let { it > System.currentTimeMillis() + 60_000 } ?: false
}
