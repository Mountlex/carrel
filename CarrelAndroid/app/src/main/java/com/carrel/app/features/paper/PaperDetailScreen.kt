package com.carrel.app.features.paper

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.LruCache
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.Image
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.carrel.app.core.cache.PDFCache
import com.carrel.app.core.network.ConvexClient
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.NetworkMonitor
import com.carrel.app.ui.components.StatusBadge
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaperDetailScreen(
    paperId: String,
    convexClient: ConvexClient,
    convexService: ConvexService? = null,
    useConvexSubscriptions: Boolean = false,
    onBackClick: () -> Unit
) {
    val viewModel: PaperViewModel = viewModel(
        key = "paper-$paperId",
        factory = viewModelFactory {
            initializer {
                PaperViewModel(
                    paperId = paperId,
                    convexClient = convexClient,
                    convexService = convexService,
                    useConvexSubscriptions = useConvexSubscriptions
                )
            }
        }
    )
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var showMenu by remember { mutableStateOf(false) }
    var showEditSheet by remember { mutableStateOf(false) }
    var editTitle by remember { mutableStateOf("") }
    var isSharing by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.paper?.title ?: "Paper") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // Share button
                    uiState.paper?.pdfUrl?.let { pdfUrl ->
                        IconButton(
                            onClick = {
                                if (isSharing) return@IconButton
                                val paperTitle = uiState.paper?.title
                                scope.launch {
                                    isSharing = true
                                    val result = sharePdfFile(context, pdfUrl, paperTitle)
                                    isSharing = false
                                    result.onFailure {
                                        snackbarHostState.showSnackbar(
                                            it.message ?: "Failed to prepare PDF for sharing"
                                        )
                                    }
                                }
                            }
                        ) {
                            if (isSharing) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(Icons.Default.Share, contentDescription = "Share PDF")
                            }
                        }
                    }

                    // Menu
                    Box {
                        IconButton(onClick = { showMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More options")
                        }

                        DropdownMenu(
                            expanded = showMenu,
                            onDismissRequest = { showMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Sync") },
                                onClick = {
                                    showMenu = false
                                    viewModel.build()
                                },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Force Rebuild") },
                                onClick = {
                                    showMenu = false
                                    viewModel.build(force = true)
                                },
                                leadingIcon = { Icon(Icons.Default.Build, contentDescription = null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Edit Details") },
                                onClick = {
                                    showMenu = false
                                    editTitle = uiState.paper?.title.orEmpty()
                                    showEditSheet = true
                                },
                                leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) }
                            )
                            uiState.paper?.takeIf { it.isPublic && !it.shareSlug.isNullOrBlank() }?.let { paper ->
                                DropdownMenuItem(
                                    text = { Text("Copy Public Link") },
                                    onClick = {
                                        showMenu = false
                                        copyShareLink(
                                            context = context,
                                            slug = paper.shareSlug!!,
                                            scope = scope,
                                            snackbarHostState = snackbarHostState
                                        )
                                    },
                                    leadingIcon = { Icon(Icons.Default.Link, contentDescription = null) }
                                )
                            }
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                uiState.isLoading && uiState.paper == null -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                uiState.paper != null -> {
                    Column(modifier = Modifier.fillMaxSize()) {
                        // PDF Viewer
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                        ) {
                            uiState.paper?.pdfUrl?.let { url ->
                                PdfViewer(
                                    pdfUrl = url,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } ?: run {
                                NoPdfPlaceholder(
                                    onBuildClick = { viewModel.build() },
                                    modifier = Modifier.align(Alignment.Center)
                                )
                            }
                        }

                        // Info panel
                        PaperInfoPanel(
                            paper = uiState.paper!!,
                            isBuilding = uiState.isBuilding
                        )
                    }
                }
                uiState.error != null -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = uiState.error ?: "An error occurred",
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.loadPaper() }) {
                            Text("Retry")
                        }
                    }
                }
            }
        }
    }

    if (showEditSheet && uiState.paper != null) {
        ModalBottomSheet(onDismissRequest = { showEditSheet = false }) {
            EditPaperSheetContent(
                initialTitle = editTitle,
                isSaving = uiState.isLoading,
                onTitleChange = { editTitle = it },
                onSave = {
                    val normalized = editTitle.trim().ifEmpty { null }
                    viewModel.updateMetadata(normalized, uiState.paper?.authors)
                    showEditSheet = false
                },
                onCancel = { showEditSheet = false }
            )
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
private fun NoPdfPlaceholder(
    onBuildClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.InsertDriveFile,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "No PDF available",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = onBuildClick) {
            Text("Build PDF")
        }
    }
}

@Composable
private fun PaperInfoPanel(
    paper: com.carrel.app.core.network.models.Paper,
    isBuilding: Boolean
) {
    Surface(
        tonalElevation = 2.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = paper.title ?: "Untitled",
                        style = MaterialTheme.typography.titleMedium
                    )
                    if (!paper.authors.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = paper.authors,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                StatusBadge(status = paper.status)
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Build status or error
            if (isBuilding || paper.compilationProgress != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = paper.compilationProgress ?: "Building...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else if (paper.lastSyncError != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = paper.lastSyncError.let { if (it.length > 50) it.take(50) + "..." else it },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        maxLines = 1
                    )
                }
            }

            // Commit details
            if (paper.lastAffectedCommitTime != null || paper.lastAffectedCommitAuthor != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AccountTree,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    paper.lastAffectedCommitTime?.let { timestamp ->
                        val timeAgo = remember(timestamp) {
                            formatTimeAgo(timestamp.toLong())
                        }
                        Text(
                            text = timeAgo,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    paper.lastAffectedCommitAuthor?.let { author ->
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "by $author",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PdfViewer(
    pdfUrl: String,
    modifier: Modifier = Modifier
) {
    var pdfFile by remember { mutableStateOf<File?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isCached by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pageCount by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val pdfCache = remember { PDFCache.getInstance(context) }
    val networkMonitor = remember { NetworkMonitor.getInstance(context) }
    val isConnected by networkMonitor.isConnected.collectAsStateWithLifecycle()
    val bitmapCache = remember {
        object : LruCache<Int, Bitmap>(MAX_BITMAP_CACHE_BYTES) {
            override fun sizeOf(key: Int, value: Bitmap): Int = value.byteCount
        }
    }

    LaunchedEffect(pdfUrl, isConnected) {
        isLoading = true
        isCached = pdfCache.isCached(pdfUrl)
        error = null
        pdfFile = null
        pageCount = 0
        bitmapCache.evictAll()
        if (!isConnected && !isCached) {
            error = "This PDF has not been downloaded yet. Connect to the internet to view it."
            isLoading = false
            return@LaunchedEffect
        }
        try {
            val (file, count) = withContext(Dispatchers.IO) {
                // Fetch PDF (from cache or network)
                val file = pdfCache.fetchPDF(pdfUrl).getOrThrow()

                val fileDescriptor = ParcelFileDescriptor.open(
                    file,
                    ParcelFileDescriptor.MODE_READ_ONLY
                )
                val renderer = PdfRenderer(fileDescriptor)
                try {
                    file to renderer.pageCount
                } finally {
                    renderer.close()
                    fileDescriptor.close()
                }
            }
            pdfFile = file
            pageCount = count
        } catch (e: Exception) {
            error = e.message
        }
        isLoading = false
    }

    BoxWithConstraints(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        val targetWidthPx = constraints.maxWidth
        val viewportWidthPx = constraints.maxWidth.toFloat()
        val viewportHeightPx = constraints.maxHeight.toFloat()
        var scale by remember(pdfUrl) { mutableFloatStateOf(1f) }
        var offsetX by remember(pdfUrl) { mutableFloatStateOf(0f) }
        var offsetY by remember(pdfUrl) { mutableFloatStateOf(0f) }

        fun clampedOffsetX(value: Float, currentScale: Float): Float {
            if (currentScale <= 1f) return 0f
            val maxOffset = ((currentScale - 1f) * viewportWidthPx) / 2f
            return value.coerceIn(-maxOffset, maxOffset)
        }

        fun clampedOffsetY(value: Float, currentScale: Float): Float {
            if (currentScale <= 1f) return 0f
            val maxOffset = ((currentScale - 1f) * viewportHeightPx) / 2f
            return value.coerceIn(-maxOffset, maxOffset)
        }

        val zoomModifier = Modifier
            .fillMaxSize()
            .clipToBounds()
            .pointerInput(pdfUrl, viewportWidthPx, viewportHeightPx) {
                detectTransformGestures { _, pan, zoom, _ ->
                    val newScale = (scale * zoom).coerceIn(1f, 4f)
                    val nextOffsetX = clampedOffsetX(offsetX + pan.x, newScale)
                    val nextOffsetY = clampedOffsetY(offsetY + pan.y, newScale)

                    scale = newScale
                    offsetX = if (newScale <= 1f) 0f else nextOffsetX
                    offsetY = if (newScale <= 1f) 0f else nextOffsetY
                }
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                translationX = offsetX
                translationY = offsetY
            }

        LaunchedEffect(targetWidthPx) {
            if (targetWidthPx > 0) {
                bitmapCache.evictAll()
            }
        }
        when {
            isLoading -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (isCached) "Loading from cache..." else "Downloading PDF...",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            error != null -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Failed to load PDF")
                    Text(
                        text = error ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
            pdfFile != null && pageCount > 0 -> {
                LazyColumn(
                    modifier = zoomModifier,
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(8.dp)
                ) {
                    items(pageCount) { index ->
                        PdfPage(
                            pdfFile = pdfFile!!,
                            pageIndex = index,
                            targetWidthPx = targetWidthPx,
                            pageCount = pageCount,
                            bitmapCache = bitmapCache
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PdfPage(
    pdfFile: File,
    pageIndex: Int,
    targetWidthPx: Int,
    pageCount: Int,
    bitmapCache: LruCache<Int, Bitmap>
) {
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(pdfFile, pageIndex, targetWidthPx) {
        if (targetWidthPx <= 0) return@LaunchedEffect
        bitmap = bitmapCache.get(pageIndex)
        if (bitmap != null) return@LaunchedEffect

        try {
            val rendered = renderPageBitmap(pdfFile, pageIndex, targetWidthPx)
            bitmapCache.put(pageIndex, rendered)
            bitmap = rendered
        } catch (e: Exception) {
            error = e.message
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            when {
                bitmap != null -> {
                    Image(
                        bitmap = bitmap!!.asImageBitmap(),
                        contentDescription = "Page ${pageIndex + 1}",
                        modifier = Modifier.fillMaxWidth(),
                        contentScale = ContentScale.FillWidth
                    )
                }
                error != null -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = error ?: "Failed to render page",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
                else -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
            }
            Text(
                text = "Page ${pageIndex + 1} of $pageCount",
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(4.dp),
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private suspend fun renderPageBitmap(
    pdfFile: File,
    pageIndex: Int,
    targetWidthPx: Int
): Bitmap = withContext(Dispatchers.IO) {
    val fileDescriptor = ParcelFileDescriptor.open(
        pdfFile,
        ParcelFileDescriptor.MODE_READ_ONLY
    )
    val renderer = PdfRenderer(fileDescriptor)
    try {
        val page = renderer.openPage(pageIndex)
        try {
            val scale = targetWidthPx.toFloat() / page.width.toFloat()
            val width = targetWidthPx.coerceAtLeast(1)
            val height = (page.height * scale).roundToInt().coerceAtLeast(1)
            val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bmp.eraseColor(android.graphics.Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            bmp
        } finally {
            page.close()
        }
    } finally {
        renderer.close()
        fileDescriptor.close()
    }
}

private const val MAX_BITMAP_CACHE_BYTES = 20 * 1024 * 1024

@Composable
private fun EditPaperSheetContent(
    initialTitle: String,
    isSaving: Boolean,
    onTitleChange: (String) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit
) {
    var title by remember(initialTitle) { mutableStateOf(initialTitle) }

    LaunchedEffect(title) {
        onTitleChange(title)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Edit Details", style = MaterialTheme.typography.titleLarge)

        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("Title") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.weight(1f)
            ) {
                Text("Cancel")
            }
            Button(
                onClick = onSave,
                enabled = !isSaving,
                modifier = Modifier.weight(1f)
            ) {
                if (isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text("Save")
            }
        }
    }
}

private suspend fun sharePdfFile(
    context: Context,
    pdfUrl: String,
    paperTitle: String?
): Result<Unit> = withContext(Dispatchers.IO) {
    runCatching {
        val cachedFile = PDFCache.getInstance(context).fetchPDF(pdfUrl).getOrThrow()
        val shareDir = File(context.cacheDir, "shared").also { it.mkdirs() }
        val safeTitle = sanitizeTitleForFileName(paperTitle ?: "Paper")
        val targetFile = File(shareDir, "$safeTitle-${System.currentTimeMillis()}.pdf")
        cachedFile.copyTo(targetFile, overwrite = true)

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            targetFile
        )

        withContext(Dispatchers.Main) {
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                clipData = ClipData.newRawUri("paper", uri)
            }
            context.startActivity(Intent.createChooser(sendIntent, "Share PDF"))
        }
    }
}

private fun sanitizeTitleForFileName(title: String): String {
    return title
        .replace("/", "-")
        .replace(":", "-")
        .replace("\\", "-")
        .ifBlank { "Paper" }
}

private fun copyShareLink(
    context: Context,
    slug: String,
    scope: CoroutineScope,
    snackbarHostState: SnackbarHostState
) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val link = "${ConvexClient.SITE_URL}/share/$slug"
    clipboard.setPrimaryClip(ClipData.newPlainText("Carrel Public Link", link))
    scope.launch {
        snackbarHostState.showSnackbar("Link copied")
    }
}

private fun formatTimeAgo(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp

    return when {
        diff < 60_000 -> "just now"
        diff < 3600_000 -> "${diff / 60_000}m ago"
        diff < 86400_000 -> "${diff / 3600_000}h ago"
        diff < 604800_000 -> "${diff / 86400_000}d ago"
        else -> "${diff / 604800_000}w ago"
    }
}
