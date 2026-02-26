package com.carrel.app

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import com.carrel.app.core.auth.OAuthCallbackResult
import com.carrel.app.core.auth.OAuthHandler
import com.carrel.app.ui.navigation.NavGraph
import com.carrel.app.ui.theme.CarrelTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Handle OAuth callback from deep link
        handleIntent(intent)

        val app = application as CarrelApplication
        val container = app.container
        if (container == null) {
            Log.e(TAG, "App started without initialized container", app.startupError)
            setContent {
                CarrelTheme {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "Carrel failed to initialize.",
                                style = MaterialTheme.typography.titleMedium
                            )
                            app.startupError?.localizedMessage?.let { message ->
                                Text(
                                    text = message,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 8.dp)
                                )
                            }
                        }
                    }
                }
            }
            return
        }

        setContent {
            val isAuthenticated by container.authManager.isAuthenticated.collectAsState()
            val hasCompletedOnboarding by container.onboardingManager.hasCompleted.collectAsState()

            // Load stored tokens and restore auth on startup
            LaunchedEffect(Unit) {
                runCatching {
                    val convexToken = container.authManager.loadStoredTokens()
                    if (convexToken != null) {
                        // Restore Convex Auth session
                        Log.d(TAG, "Restoring Convex Auth session")
                        val success = container.convexService.restoreAuthFromCache(convexToken)
                        if (!success) {
                            Log.w(TAG, "Failed to restore Convex Auth session, token may be invalid")
                            // Try silent refresh
                            val refreshed = container.authManager.refreshTokenSilently()
                            if (refreshed) {
                                // Try again with new token
                                container.authManager.getConvexAuthToken()?.let { newToken ->
                                    container.convexService.restoreAuthFromCache(newToken)
                                }
                            } else {
                                // Token is invalid - will require re-login
                                container.authManager.logout()
                            }
                        }
                    }
                }.onFailure { error ->
                    Log.e(TAG, "Startup auth restore failed", error)
                }
            }

            LaunchedEffect(isAuthenticated) {
                container.pushNotificationManager.setAuthenticated(isAuthenticated)
            }

            CarrelTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    NavGraph(
                        isAuthenticated = isAuthenticated,
                        hasCompletedOnboarding = hasCompletedOnboarding,
                        container = container
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "carrel" || uri.host != "auth") return
        val container = (application as? CarrelApplication)?.container ?: run {
            Log.w(TAG, "Ignoring OAuth callback because container is unavailable")
            return
        }

        Log.d(TAG, "Handling OAuth callback")

        when (val result = OAuthHandler.parseCallbackUri(uri)) {
            is OAuthCallbackResult.ConvexAuth -> {
                Log.d(TAG, "Received Convex Auth token, exchanging for 90-day token...")
                // Handle OAuth login (GitHub/GitLab)
                // Exchange token and set up ConvexService with the exchanged token
                lifecycleScope.launch {
                    runCatching {
                        container.authManager.handleConvexAuthCallback(result.token)

                        // Use the exchanged token (or original if exchange failed)
                        val tokenToUse = container.authManager.getConvexAuthToken()
                        if (tokenToUse != null) {
                            val success = container.convexService.setAuthToken(tokenToUse)
                            if (success) {
                                Log.d(TAG, "Convex Auth setup successful")
                            } else {
                                Log.e(TAG, "Convex Auth setup failed")
                            }
                        }
                    }.onFailure { error ->
                        Log.e(TAG, "OAuth callback handling failed", error)
                    }
                }
            }

            is OAuthCallbackResult.JwtAuth -> {
                Log.d(TAG, "Received JWT tokens (email login)")
                // Handle email/password login (HTTP-based, no subscriptions)
                container.authManager.handleOAuthCallback(
                    accessToken = result.accessToken,
                    refreshToken = result.refreshToken,
                    expiresAt = result.expiresAt,
                    refreshExpiresAt = result.refreshExpiresAt
                )
            }

            is OAuthCallbackResult.Error -> {
                Log.e(TAG, "OAuth error: ${result.message}")
            }

            null -> {
                Log.w(TAG, "Failed to parse OAuth callback")
            }
        }
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
