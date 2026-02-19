package com.carrel.app.features.settings

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.carrel.app.core.auth.AuthManager
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.models.LatexCacheMode
import com.carrel.app.core.network.models.NotificationPreferences
import com.carrel.app.core.network.models.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SettingsUiState(
    val user: User? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val notificationPreferences: NotificationPreferences = NotificationPreferences(),
    val isNotificationsLoading: Boolean = false,
    val isNotificationsUpdating: Boolean = false,
    val latexCacheMode: LatexCacheMode = LatexCacheMode.AUX,
    val isLatexCacheUpdating: Boolean = false,
    val latexCacheAllowed: Boolean = true,
    val isLatexCacheAllowedUpdating: Boolean = false,
    val backgroundRefreshDefault: Boolean = true,
    val isBackgroundRefreshDefaultUpdating: Boolean = false,
    val toastMessage: String? = null
)

class SettingsViewModel(
    private val convexService: ConvexService,
    private val authManager: AuthManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()
    private var isNotificationSyncLoopRunning = false
    private var hasPendingNotificationSync = false

    init {
        loadUser()
        loadNotificationPreferences()
    }

    fun loadUser() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            convexService.getCurrentUser()
                .onSuccess { user ->
                    Log.d(TAG, "Loaded user: ${user?.email}")
                    _uiState.update {
                        it.copy(
                            user = user,
                            isLoading = false,
                            latexCacheMode = user?.latexCacheMode ?: LatexCacheMode.AUX,
                            latexCacheAllowed = user?.latexCacheAllowed ?: true,
                            backgroundRefreshDefault = user?.backgroundRefreshDefault ?: true
                        )
                    }
                }
                .onFailure { exception ->
                    Log.e(TAG, "Failed to load user: ${exception.message}")
                    _uiState.update {
                        it.copy(
                            error = exception.message,
                            isLoading = false
                        )
                    }
                }
        }
    }

    fun loadNotificationPreferences() {
        viewModelScope.launch {
            _uiState.update { it.copy(isNotificationsLoading = true) }
            convexService.getNotificationPreferences()
                .onSuccess { preferences ->
                    _uiState.update {
                        it.copy(
                            notificationPreferences = preferences,
                            isNotificationsLoading = false
                        )
                    }
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            error = exception.message,
                            isNotificationsLoading = false
                        )
                    }
                }
        }
    }

    fun setNotificationPreferences(preferences: NotificationPreferences) {
        _uiState.update { it.copy(notificationPreferences = preferences) }
    }

    fun queueNotificationPreferencesUpdate() {
        hasPendingNotificationSync = true
        if (isNotificationSyncLoopRunning) return

        isNotificationSyncLoopRunning = true
        viewModelScope.launch {
            while (hasPendingNotificationSync) {
                hasPendingNotificationSync = false
                updateNotificationPreferences()
            }
            isNotificationSyncLoopRunning = false
            if (hasPendingNotificationSync) {
                queueNotificationPreferencesUpdate()
            }
        }
    }

    private suspend fun updateNotificationPreferences() {
        _uiState.update { it.copy(isNotificationsUpdating = true) }
        val preferences = _uiState.value.notificationPreferences
        convexService.updateNotificationPreferences(preferences)
            .onFailure { exception ->
                _uiState.update {
                    it.copy(
                        error = exception.message,
                        isNotificationsUpdating = false
                    )
                }
            }
            .onSuccess {
                _uiState.update { it.copy(isNotificationsUpdating = false) }
            }
    }

    fun updateLatexCacheMode(mode: LatexCacheMode) {
        _uiState.update { it.copy(latexCacheMode = mode, isLatexCacheUpdating = true) }
        viewModelScope.launch {
            convexService.updateLatexCacheMode(mode)
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            error = exception.message,
                            isLatexCacheUpdating = false
                        )
                    }
                }
                .onSuccess {
                    _uiState.update { it.copy(isLatexCacheUpdating = false) }
                }
        }
    }

    fun updateLatexCacheAllowed(allowed: Boolean) {
        _uiState.update { it.copy(latexCacheAllowed = allowed, isLatexCacheAllowedUpdating = true) }
        viewModelScope.launch {
            convexService.updateLatexCacheAllowed(allowed)
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            error = exception.message,
                            isLatexCacheAllowedUpdating = false
                        )
                    }
                }
                .onSuccess {
                    _uiState.update { it.copy(isLatexCacheAllowedUpdating = false) }
                }
        }
    }

    fun updateBackgroundRefreshDefault(enabled: Boolean) {
        _uiState.update { it.copy(backgroundRefreshDefault = enabled, isBackgroundRefreshDefaultUpdating = true) }
        viewModelScope.launch {
            convexService.updateBackgroundRefreshDefault(enabled)
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            error = exception.message,
                            isBackgroundRefreshDefaultUpdating = false
                        )
                    }
                }
                .onSuccess {
                    _uiState.update { it.copy(isBackgroundRefreshDefaultUpdating = false) }
                }
        }
    }

    fun sendTestNotification() {
        _uiState.update { it.copy(isNotificationsUpdating = true) }
        viewModelScope.launch {
            convexService.sendTestNotification()
                .onSuccess { result ->
                    val message = if (result.delivered == 0) {
                        when (result.reason) {
                            "disabled" -> "Enable notifications to send a test"
                            "no_tokens" -> "No device tokens registered yet"
                            "provider_not_configured" -> "Push provider not configured on backend"
                            "delivery_failed" -> "Push delivery failed (check backend push config)"
                            else -> "No registered device token yet (or push provider not configured)"
                        }
                    } else {
                        "Test notification sent"
                    }
                    _uiState.update {
                        it.copy(
                            toastMessage = message,
                            isNotificationsUpdating = false
                        )
                    }
                }
                .onFailure { exception ->
                    _uiState.update {
                        it.copy(
                            error = exception.message,
                            isNotificationsUpdating = false
                        )
                    }
                }
        }
    }

    fun logout() {
        viewModelScope.launch {
            convexService.clearAuth()
            authManager.logout()
        }
    }

    fun clearToast() {
        _uiState.update { it.copy(toastMessage = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    companion object {
        private const val TAG = "SettingsViewModel"
    }
}
