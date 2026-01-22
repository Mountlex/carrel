package com.carrel.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.carrel.app.core.di.AppContainer
import com.carrel.app.features.auth.EmailLoginScreen
import com.carrel.app.features.auth.LoginScreen
import com.carrel.app.features.gallery.GalleryScreen
import com.carrel.app.features.paper.PaperDetailScreen
import com.carrel.app.features.settings.SettingsScreen

sealed class Screen(val route: String) {
    data object Login : Screen("login")
    data object EmailLogin : Screen("email-login")
    data object Gallery : Screen("gallery")
    data object Settings : Screen("settings")
    data object PaperDetail : Screen("paper/{paperId}") {
        fun createRoute(paperId: String) = "paper/$paperId"
    }
}

@Composable
fun NavGraph(
    isAuthenticated: Boolean,
    container: AppContainer
) {
    val navController = rememberNavController()
    val startDestination = if (isAuthenticated) Screen.Gallery.route else Screen.Login.route

    // Handle auth state changes - navigate to appropriate screen
    LaunchedEffect(isAuthenticated) {
        if (isAuthenticated) {
            // Clear back stack and go to Gallery
            navController.navigate(Screen.Gallery.route) {
                popUpTo(0) { inclusive = true }
            }
        } else {
            // Clear back stack and go to Login
            navController.navigate(Screen.Login.route) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Login.route) {
            LoginScreen(
                oAuthHandler = container.oAuthHandler,
                onEmailLoginClick = {
                    navController.navigate(Screen.EmailLogin.route)
                }
            )
        }

        composable(Screen.EmailLogin.route) {
            EmailLoginScreen(
                convexClient = container.convexClient,
                authManager = container.authManager,
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.Gallery.route) {
            GalleryScreen(
                convexClient = container.convexClient,
                authManager = container.authManager,
                onPaperClick = { paperId ->
                    navController.navigate(Screen.PaperDetail.createRoute(paperId))
                },
                onSettingsClick = {
                    navController.navigate(Screen.Settings.route)
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
            PaperDetailScreen(
                paperId = paperId,
                convexClient = container.convexClient,
                onBackClick = { navController.popBackStack() }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                convexClient = container.convexClient,
                authManager = container.authManager,
                onBackClick = { navController.popBackStack() }
            )
        }
    }
}
