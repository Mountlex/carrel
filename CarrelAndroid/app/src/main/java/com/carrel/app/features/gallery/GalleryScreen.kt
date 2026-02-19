package com.carrel.app.features.gallery

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.staggeredgrid.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
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

    // Show toast messages
    LaunchedEffect(uiState.toastMessage) {
        uiState.toastMessage?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.clearToast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Papers") },
                actions = {
                    // Check All Repositories button
                    IconButton(
                        onClick = { viewModel.checkAllRepositories() },
                        enabled = !uiState.isSyncing
                    ) {
                        if (uiState.isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.Sync, contentDescription = "Check all repositories")
                        }
                    }

                    // Refresh All Papers button
                    IconButton(
                        onClick = { viewModel.refreshAllPapers() },
                        enabled = !uiState.isRefreshingAll
                    ) {
                        if (uiState.isRefreshingAll) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp
                                )
                                uiState.refreshProgress?.let { (current, total) ->
                                    Text(
                                        text = "$current/$total",
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        } else {
                            Icon(Icons.Default.PlayArrow, contentDescription = "Refresh all papers")
                        }
                    }

                    IconButton(onClick = onRepositoriesClick) {
                        Icon(Icons.Default.Folder, contentDescription = "Repositories")
                    }
                    IconButton(onClick = onSettingsClick) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
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
                    uiState.papers.isEmpty() && !uiState.isLoading -> {
                        EmptyState()
                    }
                    filteredPapers.isEmpty() && searchText.isNotBlank() -> {
                        SearchEmptyState(searchText = searchText)
                    }
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

    // Error snackbar
    uiState.error?.let { error ->
        LaunchedEffect(error) {
            // Show snackbar or handle error
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
                text = "No Papers",
                style = MaterialTheme.typography.headlineSmall
            )
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
            Text(
                text = "No results",
                style = MaterialTheme.typography.headlineSmall
            )
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
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        singleLine = true,
        label = { Text("Search papers") },
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        trailingIcon = {
            if (value.isNotBlank()) {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(Icons.Default.Clear, contentDescription = "Clear search")
                }
            }
        }
    )
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
        columns = StaggeredGridCells.Adaptive(160.dp),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalItemSpacing = 16.dp
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
