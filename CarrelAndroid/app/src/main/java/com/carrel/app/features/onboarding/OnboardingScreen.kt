package com.carrel.app.features.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
                description = "Your paper gallery for LaTeX and PDF workflows."
            ),
            OnboardingPage(
                icon = Icons.Default.PictureAsPdf,
                title = "Track Papers",
                description = "View synced papers and build output in one place."
            ),
            OnboardingPage(
                icon = Icons.Default.Folder,
                title = "Connect Repositories",
                description = "Add papers from your GitHub, GitLab, or Overleaf repos."
            ),
            OnboardingPage(
                icon = Icons.Default.Sync,
                title = "Stay Up To Date",
                description = "Sync changes and refresh builds whenever you need."
            )
        )
    }
    var pageIndex by remember { mutableIntStateOf(0) }

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.weight(1f))

            Icon(
                imageVector = pages[pageIndex].icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.height(72.dp)
            )

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = pages[pageIndex].title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = pages[pageIndex].description,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.weight(1f))

            RowIndicator(pageCount = pages.size, currentPage = pageIndex)

            Spacer(modifier = Modifier.height(20.dp))

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

@Composable
private fun RowIndicator(pageCount: Int, currentPage: Int) {
    androidx.compose.foundation.layout.Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(pageCount) { index ->
            val color = if (index == currentPage) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.outlineVariant
            }
            Surface(
                color = color,
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.height(8.dp).fillMaxWidth(fraction = 0.06f)
            ) {}
        }
    }
}

private data class OnboardingPage(
    val icon: ImageVector,
    val title: String,
    val description: String
)
