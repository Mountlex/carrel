package com.carrel.app.core.network.models

import kotlinx.serialization.Serializable

@Serializable
data class NotificationPreferences(
    val enabled: Boolean = true,
    val buildSuccess: Boolean = true,
    val buildFailure: Boolean = true,
    val paperUpdated: Boolean = true,
    val backgroundSync: Boolean = true,
    @Serializable(with = FlexibleIntSerializer::class)
    val updateCooldownMinutes: Int = 30
)
