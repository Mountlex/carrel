package com.carrel.app.features.gallery

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.carrel.app.core.auth.AuthManager
import com.carrel.app.core.network.ConvexClient
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.NetworkMonitor
import com.carrel.app.core.network.models.Paper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GalleryScreen(
    convexClient: ConvexClient,
    convexService: ConvexService,
    authManager: AuthManager,
    onPaperClick: (String) -> Unit,
    onSettingsClick: () -> Unit,
    onRepositoriesClick: () -> Unit
) {
    val viewModel = remember { GalleryViewModel(convexClient, convexService, authManager) }
    val uiState by viewModel.uiState.collectAsState()
    var searchText by remember { mutableStateOf("") }
    var showActionsMenu by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val networkMonitor = remember { NetworkMonitor.getInstance(context) }
    val isConnected by networkMonitor.isConnected.collectAsState()
    val isOffline = !isConnected

    val snackbarHostState = remember { SnackbarHostState() }
    val filteredPapers = remember(uiState.papers, searchText) {
        if (searchText.isBlank()) {
            uiState.papers
        } else {
            uiState.papers.filter { paper ->
                (paper.title ?: "").contains(searchText, ignoreCase = true)
            }
        }
    }

    LaunchedEffect(uiState.toastMessage) {
        uiState.toastMessage?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.clearToast()
        }
    }

    val subtitle = when {
        uiState.isRefreshingAll -> {
            uiState.refreshProgress?.let { (current, total) ->
                "Refreshing $current/$total"
            } ?: "Refreshing papers"
        }
        uiState.isSyncing -> "Checking repositories"
        else -> "${filteredPapers.size} papers"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Papers", style = MaterialTheme.typography.titleLarge)
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    if (uiState.isSyncing || uiState.isRefreshingAll) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(18.dp)
                                .padding(end = 8.dp),
                            strokeWidth = 2.dp
                        )
                    }

                    IconButton(onClick = onRepositoriesClick) {
                        Icon(Icons.Default.Folder, contentDescription = "Repositories")
                    }
                    IconButton(onClick = onSettingsClick) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }

                    Box {
                        IconButton(onClick = { showActionsMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More actions")
                        }

                        DropdownMenu(
                            expanded = showActionsMenu,
                            onDismissRequest = { showActionsMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Check repositories") },
                                onClick = {
                                    showActionsMenu = false
                                    viewModel.checkAllRepositories()
                                },
                                leadingIcon = { Icon(Icons.Default.Sync, contentDescription = null) },
                                enabled = !uiState.isSyncing
                            )
                            DropdownMenuItem(
                                text = { Text("Refresh papers") },
                                onClick = {
                                    showActionsMenu = false
                                    viewModel.refreshAllPapers()
                                },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null) },
                                enabled = !uiState.isRefreshingAll
                            )
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                SearchField(
                    value = searchText,
                    onValueChange = { searchText = it },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                )

                when {
                    uiState.papers.isEmpty() && !uiState.isLoading -> EmptyState()
                    filteredPapers.isEmpty() && searchText.isNotBlank() -> SearchEmptyState(searchText)
                    else -> {
                        PaperGrid(
                            papers = filteredPapers,
                            syncingPaperId = uiState.syncingPaperId,
                            isOffline = isOffline,
                            onPaperClick = onPaperClick,
                            onBuildClick = { viewModel.buildPaper(it) },
                            onForceRebuildClick = { viewModel.buildPaper(it, force = true) },
                            onDeleteClick = { viewModel.deletePaper(it) }
                        )
                    }
                }
            }
        }
    }

    uiState.error?.let { error ->
        LaunchedEffect(error) {
            snackbarHostState.showSnackbar(error)
            viewModel.clearError()
        }
    }
}

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = "No Papers", style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Add repositories on the web to see your papers here.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SearchEmptyState(searchText: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = "No results", style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "No papers match \"$searchText\"",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow
    ) {
        TextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("Search papers") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (value.isNotBlank()) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear search")
                    }
                }
            },
            colors = TextFieldDefaults.colors(
                focusedIndicatorColor = MaterialTheme.colorScheme.outlineVariant,
                unfocusedIndicatorColor = MaterialTheme.colorScheme.outlineVariant,
                focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow
            )
        )
    }
}

@Composable
private fun PaperGrid(
    papers: List<Paper>,
    syncingPaperId: String?,
    isOffline: Boolean,
    onPaperClick: (String) -> Unit,
    onBuildClick: (Paper) -> Unit,
    onForceRebuildClick: (Paper) -> Unit,
    onDeleteClick: (Paper) -> Unit
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Adaptive(170.dp),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalItemSpacing = 14.dp
    ) {
        items(papers, key = { it.id }) { paper ->
            PaperCard(
                paper = paper,
                onClick = { onPaperClick(paper.id) },
                onBuildClick = { onBuildClick(paper) },
                onForceRebuildClick = { onForceRebuildClick(paper) },
                onDeleteClick = { onDeleteClick(paper) },
                isSyncing = syncingPaperId == paper.id,
                isOffline = isOffline
            )
        }
    }
}
