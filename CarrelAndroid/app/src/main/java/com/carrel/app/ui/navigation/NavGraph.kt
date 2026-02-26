package com.carrel.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.carrel.app.core.di.AppContainer
import com.carrel.app.core.network.models.Repository
import com.carrel.app.features.auth.LoginScreen
import com.carrel.app.features.gallery.GalleryScreen
import com.carrel.app.features.onboarding.OnboardingScreen
import com.carrel.app.features.paper.PaperDetailScreen
import com.carrel.app.features.repositories.AddPaperFromRepoScreen
import com.carrel.app.features.repositories.RepositoryListScreen
import com.carrel.app.features.settings.SettingsScreen
import com.carrel.app.ui.components.OfflineBanner
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

sealed class Screen(val route: String) {
    data object Onboarding : Screen("onboarding")
    data object Login : Screen("login")
    data object Gallery : Screen("gallery")
    data object Settings : Screen("settings")
    data object Repositories : Screen("repositories")
    data object PaperDetail : Screen("paper/{paperId}") {
        fun createRoute(paperId: String) = "paper/$paperId"
    }
    data object AddPaperFromRepo : Screen("add-paper")
}

private const val SELECTED_REPOSITORY_JSON_KEY = "selected_repository_json"

@Composable
fun NavGraph(
    isAuthenticated: Boolean,
    hasCompletedOnboarding: Boolean,
    container: AppContainer
) {
    val navController = rememberNavController()
    val isConnected by container.networkMonitor.isConnected.collectAsState()
    val startDestination = when {
        !hasCompletedOnboarding -> Screen.Onboarding.route
        isAuthenticated -> Screen.Gallery.route
        else -> Screen.Login.route
    }

    // Handle auth state changes - navigate to appropriate screen
    LaunchedEffect(isAuthenticated, hasCompletedOnboarding) {
        if (!hasCompletedOnboarding) {
            navController.navigate(Screen.Onboarding.route) {
                popUpTo(navController.graph.startDestinationId) { inclusive = true }
            }
        } else if (isAuthenticated) {
            // Clear back stack and go to Gallery
            navController.navigate(Screen.Gallery.route) {
                popUpTo(navController.graph.startDestinationId) { inclusive = true }
            }
        } else {
            // Clear back stack and go to Login
            navController.navigate(Screen.Login.route) {
                popUpTo(navController.graph.startDestinationId) { inclusive = true }
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = startDestination
        ) {
            composable(Screen.Onboarding.route) {
                OnboardingScreen(
                    onComplete = {
                        container.onboardingManager.complete()
                    }
                )
            }

            composable(Screen.Login.route) {
                LoginScreen(
                    oAuthHandler = container.oAuthHandler,
                    authManager = container.authManager,
                    convexService = container.convexService,
                    useWebView = false
                )
            }

            composable(Screen.Gallery.route) {
                GalleryScreen(
                    convexClient = container.convexClient,
                    convexService = container.convexService,
                    authManager = container.authManager,
                    onPaperClick = { paperId ->
                        navController.navigate(Screen.PaperDetail.createRoute(paperId))
                    },
                    onSettingsClick = {
                        navController.navigate(Screen.Settings.route)
                    },
                    onRepositoriesClick = {
                        navController.navigate(Screen.Repositories.route)
                    }
                )
            }

            composable(
                route = Screen.PaperDetail.route,
                arguments = listOf(
                    navArgument("paperId") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val paperId = backStackEntry.arguments?.getString("paperId") ?: return@composable
                val hasConvexAuth = container.authManager.hasConvexAuth()
                PaperDetailScreen(
                    paperId = paperId,
                    convexClient = container.convexClient,
                    convexService = if (hasConvexAuth) container.convexService else null,
                    useConvexSubscriptions = hasConvexAuth,
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.Settings.route) {
                SettingsScreen(
                    convexService = container.convexService,
                    authManager = container.authManager,
                    pushNotificationManager = container.pushNotificationManager,
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.Repositories.route) {
                RepositoryListScreen(
                    convexService = container.convexService,
                    onRepositoryClick = { repository ->
                        val repositoryJson = Json.encodeToString(repository)
                        navController.currentBackStackEntry
                            ?.savedStateHandle
                            ?.set(SELECTED_REPOSITORY_JSON_KEY, repositoryJson)
                        navController.navigate(Screen.AddPaperFromRepo.route)
                    },
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(route = Screen.AddPaperFromRepo.route) { backStackEntry ->
                val repoState = navController.previousBackStackEntry?.savedStateHandle
                    ?: backStackEntry.savedStateHandle
                val repoJson = repoState.get<String>(SELECTED_REPOSITORY_JSON_KEY)
                    ?: return@composable
                repoState.remove<String>(SELECTED_REPOSITORY_JSON_KEY)
                val repository = Json.decodeFromString<Repository>(repoJson)
                AddPaperFromRepoScreen(
                    repository = repository,
                    convexService = container.convexService,
                    onBackClick = { navController.popBackStack() },
                    onPaperAdded = {
                        // Navigate back to gallery after adding paper
                        navController.popBackStack(Screen.Gallery.route, inclusive = false)
                    }
                )
            }
        }

        OfflineBanner(
            visible = !isConnected,
            modifier = Modifier.align(Alignment.TopCenter)
        )
    }
}
