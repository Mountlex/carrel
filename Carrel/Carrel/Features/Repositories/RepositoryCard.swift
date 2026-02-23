import SwiftUI

struct RepositoryCard: View {
    let repository: Repository
    var isRefreshing: Bool = false
    var showsBackgroundRefreshBadge: Bool = true
    var onOpenSettings: (() -> Void)? = nil

    var body: some View {
        let cardShape = RoundedRectangle(cornerRadius: GlassTheme.cardCornerRadius, style: .continuous)
        VStack(alignment: .leading, spacing: 12) {
            // Header: Provider icon and name
            HStack(spacing: 10) {
                Image(systemName: repository.provider.iconName)
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(repository.name)
                        .font(.headline)
                        .lineLimit(1)

                    Text(repository.provider.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if isRefreshing {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    statusBadge
                }

                if let onOpenSettings {
                    Button(action: onOpenSettings) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.capsuleLiquidGlass)
                    .accessibilityLabel("Repository settings")
                }
            }

            // Stats row
            HStack(spacing: 16) {
                // Paper count
                Label {
                    Text("\(repository.paperCount)")
                        .monospacedDigit()
                } icon: {
                    Image(systemName: "doc.text")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)

                // Error count (if any)
                if repository.papersWithErrors > 0 {
                    Label {
                        Text("\(repository.papersWithErrors)")
                            .monospacedDigit()
                    } icon: {
                        Image(systemName: "exclamationmark.triangle")
                    }
                    .font(.subheadline)
                    .foregroundStyle(GlassTheme.error)
                }

                if showsBackgroundRefreshBadge {
                    Label("Background", systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                // Latest commit time
                if let lastCommitTime = repository.lastCommitTime {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        Text(lastCommitTime.relativeFormatted)
                            .monospacedDigit()
                    }
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(16)
        .glassEffect(
            .regular.tint(GlassTheme.cardTint),
            in: cardShape
        )
        .overlay {
            cardShape
                .strokeBorder(GlassTheme.cardStroke, lineWidth: 0.8)
        }
        .accessibilityElement(children: onOpenSettings == nil ? .combine : .contain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Double tap to view papers and add tracked files")
    }

    /// Accessibility label for the entire card
    private var accessibilityLabel: String {
        var components: [String] = [repository.name]
        components.append(repository.provider.displayName)
        components.append("\(repository.paperCount) papers")

        if repository.papersWithErrors > 0 {
            components.append("\(repository.papersWithErrors) with errors")
        }

        if isRefreshing {
            components.append("refreshing")
        } else {
            components.append(statusAccessibilityLabel)
        }

        return components.joined(separator: ", ")
    }

    /// Accessibility label for the status
    private var statusAccessibilityLabel: String {
        if repository.syncStatus == .error {
            return "sync error"
        }

        switch repository.paperSyncStatus {
        case .inSync:
            return "all papers synced"
        case .needsSync:
            return "some papers need sync"
        case .neverSynced:
            return "never synced"
        case .noPapers:
            return "no papers tracked"
        }
    }

    @ViewBuilder
    private var statusBadge: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            Text(statusText)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background {
            Capsule()
                .fill(statusColor.opacity(0.14))
        }
        .overlay {
            Capsule()
                .strokeBorder(statusColor.opacity(0.35), lineWidth: 0.8)
        }
        .foregroundStyle(statusColor)
    }

    private var statusColor: Color {
        // First check if there's a sync error at the repository level
        if repository.syncStatus == .error {
            return GlassTheme.error
        }

        // Then check paper sync status
        switch repository.paperSyncStatus {
        case .inSync:
            return GlassTheme.success
        case .needsSync:
            return GlassTheme.warning
        case .neverSynced, .noPapers:
            return GlassTheme.statusNeutral
        }
    }

    private var statusText: String {
        if repository.syncStatus == .error {
            return "Error"
        }

        return repository.paperSyncStatus.displayText
    }
}

#Preview {
    VStack(spacing: 16) {
        RepositoryCard(repository: .preview)
        RepositoryCard(repository: .previewOutdated)
        RepositoryCard(repository: .previewWithErrors)
        RepositoryCard(repository: .preview, isRefreshing: true)
    }
    .padding()
}
