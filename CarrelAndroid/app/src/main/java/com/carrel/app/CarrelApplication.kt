package com.carrel.app

import android.app.Application
import android.util.Log
import com.carrel.app.core.di.appModule
import com.carrel.app.core.di.AppContainer

class CarrelApplication : Application() {
    var container: AppContainer? = null
        private set
    var startupError: Throwable? = null
        private set

    override fun onCreate() {
        super.onCreate()
        runCatching {
            appModule(this)
        }.onSuccess {
            container = it
            startupError = null
        }.onFailure { error ->
            startupError = error
            Log.e(TAG, "App container initialization failed", error)
        }
    }

    companion object {
        private const val TAG = "CarrelApplication"
    }
}
