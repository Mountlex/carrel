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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.carrel.app.R
import com.carrel.app.core.auth.AuthManager
import com.carrel.app.core.network.ConvexClient
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.NetworkMonitor
import com.carrel.app.core.network.models.Paper
import kotlinx.coroutines.launch

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
    val viewModel: GalleryViewModel = viewModel(
        factory = viewModelFactory {
            initializer { GalleryViewModel(convexClient, convexService, authManager) }
        }
    )
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var searchText by remember { mutableStateOf("") }
    var showActionsMenu by remember { mutableStateOf(false) }
    var paperToDelete by remember { mutableStateOf<Paper?>(null) }
    val hiddenPaperIds = remember { mutableStateListOf<String>() }
    val scope = rememberCoroutineScope()

    val context = LocalContext.current
    val networkMonitor = remember { NetworkMonitor.getInstance(context) }
    val isConnected by networkMonitor.isConnected.collectAsStateWithLifecycle()
    val isOffline = !isConnected

    val snackbarHostState = remember { SnackbarHostState() }
    val visiblePapers = uiState.papers.filterNot { hiddenPaperIds.contains(it.id) }
    val filteredPapers = remember(visiblePapers, searchText) {
        if (searchText.isBlank()) {
            visiblePapers
        } else {
            visiblePapers.filter { paper ->
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
                context.getString(R.string.gallery_subtitle_refreshing_progress, current, total)
            } ?: stringResource(R.string.gallery_subtitle_refreshing_papers)
        }
        uiState.isSyncing -> stringResource(R.string.gallery_subtitle_checking_repositories)
        else -> pluralStringResource(
            id = R.plurals.gallery_subtitle_papers_count,
            count = filteredPapers.size,
            filteredPapers.size
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(stringResource(R.string.gallery_title), style = MaterialTheme.typography.titleLarge)
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

                    Box {
                        IconButton(onClick = { showActionsMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.content_desc_more_actions))
                        }

                        DropdownMenu(
                            expanded = showActionsMenu,
                            onDismissRequest = { showActionsMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.gallery_menu_repositories)) },
                                onClick = {
                                    showActionsMenu = false
                                    onRepositoriesClick()
                                },
                                leadingIcon = { Icon(Icons.Default.Folder, contentDescription = stringResource(R.string.content_desc_repositories)) }
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.gallery_menu_settings)) },
                                onClick = {
                                    showActionsMenu = false
                                    onSettingsClick()
                                },
                                leadingIcon = { Icon(Icons.Default.Settings, contentDescription = stringResource(R.string.content_desc_settings)) }
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.gallery_menu_check_repositories)) },
                                onClick = {
                                    showActionsMenu = false
                                    viewModel.checkAllRepositories()
                                },
                                leadingIcon = { Icon(Icons.Default.Sync, contentDescription = null) },
                                enabled = !uiState.isSyncing
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.gallery_menu_refresh_papers)) },
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
                    visiblePapers.isEmpty() && !uiState.isLoading -> EmptyState()
                    filteredPapers.isEmpty() && searchText.isNotBlank() -> SearchEmptyState(searchText)
                    else -> {
                        PaperGrid(
                            papers = filteredPapers,
                            syncingPaperId = uiState.syncingPaperId,
                            isOffline = isOffline,
                            onPaperClick = onPaperClick,
                            onBuildClick = { viewModel.buildPaper(it) },
                            onForceRebuildClick = { viewModel.buildPaper(it, force = true) },
                            onDeleteClick = { paperToDelete = it }
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

    paperToDelete?.let { paper ->
        AlertDialog(
            onDismissRequest = { paperToDelete = null },
            title = { Text(stringResource(R.string.delete_paper_dialog_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.delete_paper_dialog_body,
                        paper.title ?: stringResource(R.string.paper_untitled)
                    )
                )
            },
            dismissButton = {
                TextButton(onClick = { paperToDelete = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        paperToDelete = null
                        if (!hiddenPaperIds.contains(paper.id)) {
                            hiddenPaperIds.add(paper.id)
                        }
                        scope.launch {
                            val result = snackbarHostState.showSnackbar(
                                message = context.getString(
                                    R.string.paper_deleted_snackbar,
                                    paper.title ?: context.getString(R.string.paper_untitled)
                                ),
                                actionLabel = context.getString(R.string.action_undo),
                                duration = SnackbarDuration.Long
                            )
                            if (result == SnackbarResult.ActionPerformed) {
                                hiddenPaperIds.remove(paper.id)
                            } else {
                                hiddenPaperIds.remove(paper.id)
                                viewModel.deletePaper(paper)
                            }
                        }
                    }
                ) {
                    Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                }
            }
        )
    }
}

@Composable
private fun EmptyState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = stringResource(R.string.gallery_empty_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.gallery_empty_body),
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
            Text(text = stringResource(R.string.gallery_search_empty_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.gallery_search_empty_body, searchText),
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
            placeholder = { Text(stringResource(R.string.gallery_search_placeholder)) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = stringResource(R.string.content_desc_search)) },
            trailingIcon = {
                if (value.isNotBlank()) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(Icons.Default.Clear, contentDescription = stringResource(R.string.action_clear_search))
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
