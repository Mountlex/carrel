package com.carrel.app.core.onboarding

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class OnboardingManager(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val _hasCompleted = MutableStateFlow(
        prefs.getBoolean(KEY_HAS_COMPLETED, false)
    )
    val hasCompleted: StateFlow<Boolean> = _hasCompleted.asStateFlow()

    fun complete() {
        prefs.edit().putBoolean(KEY_HAS_COMPLETED, true).apply()
        _hasCompleted.value = true
    }

    companion object {
        private const val PREFS_NAME = "carrel_onboarding"
        private const val KEY_HAS_COMPLETED = "has_completed_onboarding"
    }
}
