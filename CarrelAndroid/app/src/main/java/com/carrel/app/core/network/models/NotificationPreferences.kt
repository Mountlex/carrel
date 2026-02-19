package com.carrel.app.core.network.models

import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

@Serializable
data class NotificationPreferences(
    val enabled: Boolean = true,
    val buildSuccess: Boolean = true,
    val buildFailure: Boolean = true,
    val paperUpdated: Boolean = true,
    val backgroundSync: Boolean = true,
    val updateCooldownMinutes: Double = 30.0
) {
    val updateCooldownMinutesInt: Int
        get() = updateCooldownMinutes.roundToInt()
}
