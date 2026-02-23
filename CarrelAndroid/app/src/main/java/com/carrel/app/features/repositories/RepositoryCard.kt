package com.carrel.app.features.repositories

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.carrel.app.core.network.models.PaperSyncStatus
import com.carrel.app.core.network.models.Repository
import com.carrel.app.core.network.models.RepositoryProvider
import com.carrel.app.core.network.models.RepositorySyncStatus
import com.carrel.app.ui.theme.StatusError
import com.carrel.app.ui.theme.StatusPending
import com.carrel.app.ui.theme.StatusSynced
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun RepositoryCard(
    repository: Repository,
    isRefreshing: Boolean = false,
    showsBackgroundRefreshBadge: Boolean = true,
    onOpenSettings: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        tonalElevation = 1.dp
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    ProviderIcon(provider = repository.provider)

                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = repository.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = repository.provider.displayName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                if (isRefreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    StatusBadge(
                        syncStatus = repository.syncStatus,
                        paperSyncStatus = repository.paperSyncStatus
                    )
                }

                onOpenSettings?.let {
                    Spacer(modifier = Modifier.width(4.dp))
                    IconButton(onClick = it) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Repository settings"
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Description,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "${repository.paperCountInt}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (repository.papersWithErrorsInt > 0) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                        Text(
                            text = "${repository.papersWithErrorsInt}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }

                Spacer(modifier = Modifier.weight(1f))

                repository.lastCommitTime?.let { timestamp ->
                    Text(
                        text = formatTimestamp(timestamp.toLong()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (!showsBackgroundRefreshBadge) {
                Text(
                    text = "Background refresh paused",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ProviderIcon(provider: RepositoryProvider) {
    val iconText = when (provider) {
        RepositoryProvider.GITHUB -> "GH"
        RepositoryProvider.GITLAB -> "GL"
        RepositoryProvider.SELFHOSTED_GITLAB -> "GL"
        RepositoryProvider.OVERLEAF -> "OL"
        RepositoryProvider.GENERIC -> "Git"
    }

    val backgroundColor = when (provider) {
        RepositoryProvider.GITHUB -> Color(0xFF1F2937)
        RepositoryProvider.GITLAB -> Color(0xFFE57A44)
        RepositoryProvider.SELFHOSTED_GITLAB -> Color(0xFFE57A44)
        RepositoryProvider.OVERLEAF -> Color(0xFF4F9E63)
        RepositoryProvider.GENERIC -> MaterialTheme.colorScheme.primary
    }

    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(backgroundColor),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = iconText,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )
    }
}

@Composable
private fun StatusBadge(
    syncStatus: RepositorySyncStatus,
    paperSyncStatus: PaperSyncStatus
) {
    val (color, text) = when {
        syncStatus == RepositorySyncStatus.ERROR -> StatusError to "Error"
        paperSyncStatus == PaperSyncStatus.IN_SYNC -> StatusSynced to paperSyncStatus.displayText
        paperSyncStatus == PaperSyncStatus.NEEDS_SYNC -> StatusPending to paperSyncStatus.displayText
        else -> MaterialTheme.colorScheme.onSurfaceVariant to paperSyncStatus.displayText
    }

    Surface(
        shape = CircleShape,
        color = color.copy(alpha = 0.12f)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(color)
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = color
            )
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp

    val seconds = diff / 1000
    val minutes = seconds / 60
    val hours = minutes / 60
    val days = hours / 24

    return when {
        seconds < 60 -> "just now"
        minutes < 60 -> "${minutes}m ago"
        hours < 24 -> "${hours}h ago"
        days < 7 -> "${days}d ago"
        else -> {
            val date = Date(timestamp)
            val formatter = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
            formatter.format(date)
        }
    }
}
