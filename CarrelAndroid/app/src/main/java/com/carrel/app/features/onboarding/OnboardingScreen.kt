package com.carrel.app.features.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun OnboardingScreen(
    onComplete: () -> Unit
) {
    val pages = remember {
        listOf(
            OnboardingPage(
                icon = Icons.Default.AutoAwesome,
                title = "Welcome to Carrel",
                description = "A calm, focused workspace for your papers."
            ),
            OnboardingPage(
                icon = Icons.Default.PictureAsPdf,
                title = "Track Every Draft",
                description = "See synced PDFs, build status, and recent updates in one gallery."
            ),
            OnboardingPage(
                icon = Icons.Default.Folder,
                title = "Connect Repositories",
                description = "Bring in GitHub, GitLab, and Overleaf projects quickly."
            ),
            OnboardingPage(
                icon = Icons.Default.Sync,
                title = "Stay In Sync",
                description = "Refresh when needed and always know what changed."
            )
        )
    }
    var pageIndex by remember { mutableIntStateOf(0) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.surfaceContainerLow
                    )
                )
            )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.Center)
                .padding(horizontal = 20.dp),
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            tonalElevation = 2.dp,
            shadowElevation = 6.dp
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer
                ) {
                    Icon(
                        imageVector = pages[pageIndex].icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        modifier = Modifier
                            .padding(16.dp)
                            .size(28.dp)
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                Text(
                    text = pages[pageIndex].title,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(10.dp))

                Text(
                    text = pages[pageIndex].description,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(20.dp))

                RowIndicator(pageCount = pages.size, currentPage = pageIndex)

                Spacer(modifier = Modifier.height(22.dp))

                Button(
                    onClick = {
                        if (pageIndex < pages.lastIndex) {
                            pageIndex += 1
                        } else {
                            onComplete()
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (pageIndex < pages.lastIndex) "Continue" else "Get Started")
                }

                if (pageIndex < pages.lastIndex) {
                    TextButton(onClick = onComplete) {
                        Text("Skip")
                    }
                }
            }
        }
    }
}

@Composable
private fun RowIndicator(pageCount: Int, currentPage: Int) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(pageCount) { index ->
            val color = if (index == currentPage) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.outlineVariant
            }
            val width = if (index == currentPage) 24.dp else 10.dp
            Box(
                modifier = Modifier
                    .width(width)
                    .height(8.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(color)
            )
        }
    }
}

private data class OnboardingPage(
    val icon: ImageVector,
    val title: String,
    val description: String
)
