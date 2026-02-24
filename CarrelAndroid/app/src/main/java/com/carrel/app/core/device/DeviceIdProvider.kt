package com.carrel.app.core.device

import android.content.Context
import java.util.UUID

object DeviceIdProvider {
    private const val PREFS_NAME = "carrel_device"
    private const val KEY_DEVICE_ID = "installation_id"

    fun getOrCreate(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing

        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, generated).apply()
        return generated
    }
}
