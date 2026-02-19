package com.carrel.app.features.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Launch
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.carrel.app.BuildConfig
import com.carrel.app.core.auth.AuthManager
import com.carrel.app.core.cache.PDFCache
import com.carrel.app.core.cache.ThumbnailCache
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.models.LatexCacheMode
import com.carrel.app.core.notifications.PushNotificationManager
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    convexService: ConvexService,
    authManager: AuthManager,
    pushNotificationManager: PushNotificationManager,
    onBackClick: () -> Unit
) {
    val viewModel = remember { SettingsViewModel(convexService, authManager) }
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var showLogoutDialog by remember { mutableStateOf(false) }
    var pdfCacheSize by remember { mutableLongStateOf(0L) }
    var thumbnailCacheSize by remember { mutableLongStateOf(0L) }
    val pdfCache = remember { PDFCache.getInstance(context) }
    val thumbnailCache = remember { ThumbnailCache.getInstance(context) }
    val snackbarHostState = remember { SnackbarHostState() }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val updated = uiState.notificationPreferences.copy(enabled = true)
            viewModel.setNotificationPreferences(updated)
            viewModel.queueNotificationPreferencesUpdate()
            pushNotificationManager.fetchCurrentToken()
        } else {
            val updated = uiState.notificationPreferences.copy(enabled = false)
            viewModel.setNotificationPreferences(updated)
            viewModel.queueNotificationPreferencesUpdate()
        }
    }

    LaunchedEffect(Unit) {
        pdfCacheSize = pdfCache.cacheSize()
        thumbnailCacheSize = thumbnailCache.cacheSize()
    }

    LaunchedEffect(uiState.toastMessage) {
        uiState.toastMessage?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.clearToast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            SectionTitle("Account")
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                when {
                    uiState.isLoading -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            androidx.compose.material3.CircularProgressIndicator()
                        }
                    }
                    uiState.user != null -> {
                        val user = uiState.user!!
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (user.image != null) {
                                AsyncImage(
                                    model = user.image,
                                    contentDescription = "Profile picture",
                                    modifier = Modifier
                                        .size(56.dp)
                                        .clip(CircleShape)
                                )
                            } else {
                                Box(
                                    modifier = Modifier
                                        .size(56.dp)
                                        .clip(CircleShape)
                                        .background(MaterialTheme.colorScheme.surfaceVariant),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Person,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(16.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                user.name?.let { Text(text = it, style = MaterialTheme.typography.titleMedium) }
                                user.email?.let {
                                    Text(
                                        text = it,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }

                                val providers = buildList {
                                    if (user.hasGitHubToken) add("github")
                                    if (user.hasGitLabToken) add("gitlab")
                                    if (user.hasOverleafCredentials) add("overleaf")
                                }
                                if (providers.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        providers.forEach { provider ->
                                            ProviderBadge(provider = provider)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else -> {
                        Text(
                            text = "Failed to load user",
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            SectionTitle("Notifications")
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    PreferenceToggle(
                        title = "Enable Notifications",
                        checked = uiState.notificationPreferences.enabled,
                        enabled = !uiState.isNotificationsUpdating,
                        onCheckedChange = { enabled ->
                            if (enabled) {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    val granted = ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.POST_NOTIFICATIONS
                                    ) == PackageManager.PERMISSION_GRANTED
                                    if (!granted) {
                                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                        return@PreferenceToggle
                                    }
                                }
                                val updated = uiState.notificationPreferences.copy(enabled = true)
                                viewModel.setNotificationPreferences(updated)
                                viewModel.queueNotificationPreferencesUpdate()
                                pushNotificationManager.fetchCurrentToken()
                            } else {
                                val updated = uiState.notificationPreferences.copy(enabled = false)
                                viewModel.setNotificationPreferences(updated)
                                viewModel.queueNotificationPreferencesUpdate()
                                pushNotificationManager.unregisterDeviceToken()
                            }
                        }
                    )
                    HorizontalDivider()
                    PreferenceToggle(
                        title = "Build Completed",
                        checked = uiState.notificationPreferences.buildSuccess,
                        enabled = uiState.notificationPreferences.enabled,
                        onCheckedChange = {
                            viewModel.setNotificationPreferences(
                                uiState.notificationPreferences.copy(buildSuccess = it)
                            )
                            viewModel.queueNotificationPreferencesUpdate()
                        }
                    )
                    HorizontalDivider()
                    PreferenceToggle(
                        title = "Build Failed",
                        checked = uiState.notificationPreferences.buildFailure,
                        enabled = uiState.notificationPreferences.enabled,
                        onCheckedChange = {
                            viewModel.setNotificationPreferences(
                                uiState.notificationPreferences.copy(buildFailure = it)
                            )
                            viewModel.queueNotificationPreferencesUpdate()
                        }
                    )
                    HorizontalDivider()
                    PreferenceToggle(
                        title = "Paper Updated",
                        checked = uiState.notificationPreferences.paperUpdated,
                        enabled = uiState.notificationPreferences.enabled && uiState.notificationPreferences.backgroundSync,
                        onCheckedChange = {
                            viewModel.setNotificationPreferences(
                                uiState.notificationPreferences.copy(paperUpdated = it)
                            )
                            viewModel.queueNotificationPreferencesUpdate()
                        }
                    )
                    if (!uiState.notificationPreferences.backgroundSync) {
                        Text(
                            text = "Allow Background Refresh to receive update notifications.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                    HorizontalDivider()
                    PreferenceToggle(
                        title = "Background Refresh",
                        checked = uiState.notificationPreferences.backgroundSync,
                        enabled = uiState.notificationPreferences.enabled,
                        onCheckedChange = {
                            viewModel.setNotificationPreferences(
                                uiState.notificationPreferences.copy(backgroundSync = it)
                            )
                            viewModel.queueNotificationPreferencesUpdate()
                        }
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Update Cooldown") },
                        supportingContent = {
                            Text("Minutes between repeated update notifications")
                        },
                        trailingContent = {
                            Text(updateCooldownLabel(uiState.notificationPreferences.updateCooldownMinutesInt))
                        }
                    )
                    val cooldownControlsEnabled = uiState.notificationPreferences.enabled &&
                        uiState.notificationPreferences.paperUpdated &&
                        uiState.notificationPreferences.backgroundSync
                    FlowRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(0, 15, 30, 60, -1).forEach { value ->
                            FilterChip(
                                selected = uiState.notificationPreferences.updateCooldownMinutesInt == value,
                                onClick = {
                                    viewModel.setNotificationPreferences(
                                        uiState.notificationPreferences.copy(updateCooldownMinutes = value.toDouble())
                                    )
                                    viewModel.queueNotificationPreferencesUpdate()
                                },
                                enabled = cooldownControlsEnabled,
                                label = { Text(updateCooldownChipLabel(value)) }
                            )
                        }
                    }
                    Text(
                        text = "If new commits arrive while a paper is already out of sync, we'll notify at most once per interval when Background Refresh is allowed. Choose Never to disable update notifications.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Send Test Notification") },
                        leadingContent = {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Send,
                                contentDescription = null
                            )
                        },
                        modifier = Modifier.clickable {
                            scope.launch {
                                pushNotificationManager.registerCurrentTokenNow()
                                viewModel.sendTestNotification()
                            }
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            SectionTitle("Background Refresh")
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    PreferenceToggle(
                        title = "Default for repositories",
                        checked = uiState.backgroundRefreshDefault,
                        enabled = !uiState.isBackgroundRefreshDefaultUpdating,
                        onCheckedChange = { enabled ->
                            viewModel.updateBackgroundRefreshDefault(enabled)
                        }
                    )
                    ListItem(
                        headlineContent = { Text("Info") },
                        supportingContent = {
                            Text("Allow Background Refresh pauses or resumes all background refresh tasks. The default applies to repositories set to use it.")
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            SectionTitle("Compilation")
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    PreferenceToggle(
                        title = "Allow compilation cache",
                        checked = uiState.latexCacheAllowed,
                        enabled = !uiState.isLatexCacheAllowedUpdating,
                        onCheckedChange = { enabled ->
                            viewModel.updateLatexCacheAllowed(enabled)
                        }
                    )
                    HorizontalDivider()
                    PreferenceToggle(
                        title = "Default for repositories",
                        checked = uiState.latexCacheMode == LatexCacheMode.AUX,
                        enabled = !uiState.isLatexCacheUpdating,
                        onCheckedChange = { enabled ->
                            viewModel.updateLatexCacheMode(if (enabled) LatexCacheMode.AUX else LatexCacheMode.OFF)
                        }
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Info") },
                        supportingContent = {
                            Text("Allow compilation cache pauses or resumes all cache use. The default applies to repositories set to use it.")
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            SectionTitle("Storage")
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    ListItem(
                        headlineContent = { Text("PDF Cache") },
                        supportingContent = { Text("Cached PDFs for offline viewing") },
                        trailingContent = { Text(formatCacheSize(pdfCacheSize)) }
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Thumbnail Cache") },
                        supportingContent = { Text("Cached paper thumbnails") },
                        trailingContent = { Text(formatCacheSize(thumbnailCacheSize)) }
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Clear All Caches") },
                        leadingContent = {
                            val canClearCaches = pdfCacheSize > 0L || thumbnailCacheSize > 0L
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = null,
                                tint = if (canClearCaches) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        },
                        modifier = Modifier.clickable(
                            enabled = pdfCacheSize > 0L || thumbnailCacheSize > 0L
                        ) {
                            scope.launch {
                                pdfCache.clearCache()
                                thumbnailCache.clearCache()
                                pdfCacheSize = 0L
                                thumbnailCacheSize = 0L
                            }
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            SectionTitle("About")
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    ListItem(
                        headlineContent = { Text("Version") },
                        trailingContent = { Text(BuildConfig.VERSION_NAME) }
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Build") },
                        trailingContent = { Text(BuildConfig.VERSION_CODE.toString()) }
                    )
                    HorizontalDivider()
                    ListItem(
                        headlineContent = { Text("Website") },
                        trailingContent = {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Launch,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        modifier = Modifier.clickable {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://carrelapp.com"))
                            context.startActivity(intent)
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = { showLogoutDialog = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                    contentDescription = null
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out")
            }
        }
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Sign Out") },
            text = { Text("Are you sure you want to sign out?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        viewModel.logout()
                    }
                ) {
                    Text("Sign Out", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    uiState.error?.let {
        LaunchedEffect(it) {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(bottom = 8.dp)
    )
}

@Composable
private fun PreferenceToggle(
    title: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    ListItem(
        headlineContent = { Text(title) },
        trailingContent = {
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled
            )
        }
    )
}

@Composable
private fun ProviderBadge(provider: String) {
    val (icon, name) = when (provider.lowercase()) {
        "github" -> Icons.Default.Cloud to "GitHub"
        "gitlab" -> Icons.Default.Code to "GitLab"
        else -> Icons.Default.VpnKey to provider.replaceFirstChar { it.uppercase() }
    }

    androidx.compose.material3.Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = name,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun formatCacheSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        bytes < 1024 * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        else -> String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0))
    }
}

private fun updateCooldownChipLabel(minutes: Int): String {
    return when {
        minutes < 0 -> "Never"
        minutes == 0 -> "Every update"
        else -> "${minutes}m"
    }
}

private fun updateCooldownLabel(minutes: Int): String {
    return when {
        minutes < 0 -> "Never"
        minutes == 0 -> "Every update"
        else -> "$minutes minutes"
    }
}
