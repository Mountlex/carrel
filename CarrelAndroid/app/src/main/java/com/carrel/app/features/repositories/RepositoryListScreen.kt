package com.carrel.app.features.repositories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.models.LatexCacheMode
import com.carrel.app.core.network.models.Repository

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RepositoryListScreen(
    convexService: ConvexService,
    onRepositoryClick: (Repository) -> Unit,
    onBackClick: () -> Unit
) {
    val viewModel = remember { RepositoryListViewModel(convexService) }
    val uiState by viewModel.uiState.collectAsState()

    var repositoryToDelete by remember { mutableStateOf<Repository?>(null) }
    var repositoryForSettings by remember { mutableStateOf<Repository?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.loadRepositories()
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
                title = { Text("Repositories") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (uiState.isCheckingAll) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(24.dp)
                                .padding(end = 12.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        IconButton(
                            onClick = { viewModel.checkAllRepositories() },
                            enabled = !uiState.isCheckingAll
                        ) {
                            Icon(Icons.Default.Sync, contentDescription = "Check all repositories")
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.checkAllRepositories() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                uiState.repositories.isEmpty() -> {
                    EmptyState()
                }
                else -> {
                    Column(modifier = Modifier.fillMaxSize()) {
                        if (!uiState.isBackgroundRefreshAllowed) {
                            Text(
                                text = "Background refresh is paused in settings.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }
                        RepositoryList(
                            repositories = uiState.repositories,
                            refreshingRepoId = uiState.refreshingRepoId,
                            backgroundRefreshDefault = uiState.backgroundRefreshDefault,
                            isBackgroundRefreshAllowed = uiState.isBackgroundRefreshAllowed,
                            onRepositoryClick = onRepositoryClick,
                            onRefreshClick = { viewModel.refreshRepository(it) },
                            onDeleteClick = { repositoryToDelete = it },
                            onOpenSettings = { repositoryForSettings = it }
                        )
                    }
                }
            }
        }
    }

    repositoryToDelete?.let { repository ->
        AlertDialog(
            onDismissRequest = { repositoryToDelete = null },
            title = { Text("Delete Repository?") },
            text = {
                Text("This will also delete all ${repository.paperCountInt} tracked papers from \"${repository.name}\". This action cannot be undone.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteRepository(repository)
                        repositoryToDelete = null
                    },
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { repositoryToDelete = null }) {
                    Text("Cancel")
                }
            }
        )
    }

    repositoryForSettings?.let { repository ->
        ModalBottomSheet(onDismissRequest = { repositoryForSettings = null }) {
            RepositorySettingsSheet(
                repository = repository,
                backgroundRefreshDefault = uiState.backgroundRefreshDefault,
                userCacheMode = uiState.userCacheMode,
                onBackgroundRefreshChange = { enabled ->
                    viewModel.setBackgroundRefresh(repository, enabled)
                },
                onCacheModeChange = { mode ->
                    viewModel.setCompilationCacheMode(repository, mode)
                }
            )
        }
    }
}

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "No Repositories",
                style = MaterialTheme.typography.headlineSmall
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Add repositories on the web to see them here.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun RepositoryList(
    repositories: List<Repository>,
    refreshingRepoId: String?,
    backgroundRefreshDefault: Boolean,
    isBackgroundRefreshAllowed: Boolean,
    onRepositoryClick: (Repository) -> Unit,
    onRefreshClick: (Repository) -> Unit,
    onDeleteClick: (Repository) -> Unit,
    onOpenSettings: (Repository) -> Unit
) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(repositories, key = { it.id }) { repository ->
            val repoRefreshEnabled = repository.backgroundRefreshEnabled
                ?: backgroundRefreshDefault
            val showRefreshBadge = isBackgroundRefreshAllowed && repoRefreshEnabled

            SwipeableRepositoryCard(
                repository = repository,
                isRefreshing = refreshingRepoId == repository.id,
                showsBackgroundRefreshBadge = showRefreshBadge,
                onClick = { onRepositoryClick(repository) },
                onRefreshClick = { onRefreshClick(repository) },
                onDeleteClick = { onDeleteClick(repository) },
                onOpenSettings = { onOpenSettings(repository) }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeableRepositoryCard(
    repository: Repository,
    isRefreshing: Boolean,
    showsBackgroundRefreshBadge: Boolean,
    onClick: () -> Unit,
    onRefreshClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val dismissState = androidx.compose.material3.rememberSwipeToDismissBoxState(
        confirmValueChange = { dismissValue ->
            when (dismissValue) {
                SwipeToDismissBoxValue.EndToStart -> {
                    onDeleteClick()
                    false
                }
                else -> false
            }
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onRefreshClick) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    IconButton(onClick = onDeleteClick) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Delete",
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        },
        content = {
            RepositoryCard(
                repository = repository,
                isRefreshing = isRefreshing,
                showsBackgroundRefreshBadge = showsBackgroundRefreshBadge,
                onOpenSettings = onOpenSettings,
                modifier = Modifier.clickable(onClick = onClick)
            )
        },
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = true
    )
}

@Composable
private fun RepositorySettingsSheet(
    repository: Repository,
    backgroundRefreshDefault: Boolean,
    userCacheMode: LatexCacheMode,
    onBackgroundRefreshChange: (Boolean?) -> Unit,
    onCacheModeChange: (LatexCacheMode?) -> Unit
) {
    val currentBackground = repository.backgroundRefreshEnabled
    val currentCache = repository.latexCacheMode

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(text = repository.name, style = MaterialTheme.typography.titleLarge)

        HorizontalDivider()

        Text("Background Refresh", style = MaterialTheme.typography.titleMedium)
        Text(
            text = "Default uses global setting: ${if (backgroundRefreshDefault) "On" else "Off"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = currentBackground == null,
                onClick = { onBackgroundRefreshChange(null) },
                label = { Text("Default") }
            )
            FilterChip(
                selected = currentBackground == true,
                onClick = { onBackgroundRefreshChange(true) },
                label = { Text("On") }
            )
            FilterChip(
                selected = currentBackground == false,
                onClick = { onBackgroundRefreshChange(false) },
                label = { Text("Off") }
            )
        }

        HorizontalDivider()

        Text("Compilation Cache", style = MaterialTheme.typography.titleMedium)
        Text(
            text = "Default uses global setting: ${userCacheMode.displayName}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = currentCache == null,
                onClick = { onCacheModeChange(null) },
                label = { Text("Default") }
            )
            FilterChip(
                selected = currentCache == LatexCacheMode.AUX,
                onClick = { onCacheModeChange(LatexCacheMode.AUX) },
                label = { Text("On") }
            )
            FilterChip(
                selected = currentCache == LatexCacheMode.OFF,
                onClick = { onCacheModeChange(LatexCacheMode.OFF) },
                label = { Text("Off") }
            )
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Changes are saved automatically",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
