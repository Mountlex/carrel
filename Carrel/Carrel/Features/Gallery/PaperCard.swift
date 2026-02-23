import SwiftUI

struct PaperCard: View {
    let paper: Paper
    var isSyncing: Bool = false
    var isOffline: Bool = false
    var isCached: Bool = false
    @ScaledMetric(relativeTo: .subheadline) private var titleLineHeight: CGFloat = 17

    var body: some View {
        let cardShape = RoundedRectangle(cornerRadius: GlassTheme.cardCornerRadius, style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            // Thumbnail - content layer, no glass
            thumbnailView
                .frame(height: 200)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: GlassTheme.cardCornerRadius,
                        topTrailingRadius: GlassTheme.cardCornerRadius
                    )
                )
                .overlay(alignment: .topTrailing) {
                    // Show "available offline" indicator when offline and paper is cached
                    if isOffline && isCached {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.body)
                            .foregroundStyle(.white.opacity(0.9))
                            .shadow(color: .black.opacity(0.3), radius: 2)
                            .padding(8)
                    }
                }
                .accessibilityHidden(true)

            // Info section with glass backdrop
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Text(paper.title ?? "Untitled")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(2)
                        .frame(minHeight: titleLineHeight * 2, alignment: .top)
                        .foregroundStyle(.primary)

                    Spacer()

                    if isSyncing || paper.status == .building {
                        ProgressView()
                            .scaleEffect(0.5)
                            .padding(.top, 2)
                            .accessibilityLabel("Syncing")
                    } else {
                        Image(systemName: statusIcon)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(statusColor)
                            .padding(.top, 2)
                            .accessibilityLabel(statusAccessibilityLabel)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .glassEffect(
            .regular.tint(GlassTheme.cardTint),
            in: cardShape
        )
        .overlay {
            cardShape
                .strokeBorder(GlassTheme.cardStroke, lineWidth: 0.8)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Double tap to view paper details")
    }

    /// Accessibility label for the entire card
    private var accessibilityLabel: String {
        let title = paper.title ?? "Untitled"
        let status = isSyncing ? "syncing" : statusAccessibilityLabel
        let offlineAvailable = (isOffline && isCached) ? ", available offline" : ""
        return "\(title), \(status)\(offlineAvailable)"
    }

    /// Accessibility label for the status indicator
    private var statusAccessibilityLabel: String {
        paper.status.accessibilityLabel(showsDownloadedIndicator: paper.status == .synced && isCached)
    }

    @ViewBuilder
    private var thumbnailView: some View {
        if let thumbnailUrl = paper.thumbnailUrl, let url = URL(string: thumbnailUrl) {
            CachedThumbnail(url: url)
        } else {
            placeholderView
        }
    }

    private var placeholderView: some View {
        Rectangle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: "doc.text")
                    .font(.largeTitle)
                    .foregroundStyle(.tertiary)
            }
    }

    private var statusColor: Color {
        switch paper.status {
        case .synced:
            return GlassTheme.success
        case .pending:
            return GlassTheme.warning
        case .building:
            return GlassTheme.accent
        case .error:
            return GlassTheme.error
        case .uploaded, .unknown:
            return GlassTheme.statusNeutral
        }
    }

    private var statusIcon: String {
        paper.status.iconName(showsDownloadedIndicator: paper.status == .synced && isCached)
    }
}

struct CachedThumbnail: View {
    let url: URL
    @State private var image: UIImage?
    @State private var isLoading = true

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else if isLoading {
                Rectangle()
                    .fill(.quaternary)
                    .overlay {
                        ProgressView()
                    }
            } else {
                Rectangle()
                    .fill(.quaternary)
                    .overlay {
                        Image(systemName: "doc.text")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                    }
            }
        }
        .task(id: url) {
            await loadThumbnail(for: url)
        }
    }

    private func loadThumbnail(for url: URL) async {
        image = nil
        isLoading = true

        do {
            let thumbnail = try await ThumbnailCache.shared.fetchThumbnail(from: url)
            guard !Task.isCancelled else { return }
            image = thumbnail
        } catch {
            guard !Task.isCancelled else { return }
        }
        guard !Task.isCancelled else { return }
        isLoading = false
    }
}

#Preview {
    HStack {
        PaperCard(paper: Paper.preview)
            .frame(width: 180)

        PaperCard(paper: Paper.previewError)
            .frame(width: 180)
    }
    .padding()
}

extension Paper {
    static var preview: Paper {
        try! JSONDecoder().decode(Paper.self, from: """
        {
            "_id": "1",
            "title": "A Long Paper Title That Might Wrap",
            "thumbnailUrl": null,
            "isUpToDate": true,
            "isPublic": false,
            "lastAffectedCommitTime": 1704067200000,
            "lastAffectedCommitAuthor": "John Doe",
            "createdAt": 1704067200000,
            "updatedAt": 1704067200000
        }
        """.data(using: .utf8)!)
    }

    static var previewError: Paper {
        try! JSONDecoder().decode(Paper.self, from: """
        {
            "_id": "2",
            "title": "Paper with Error",
            "thumbnailUrl": null,
            "buildStatus": "error",
            "isPublic": false,
            "createdAt": 1704067200000,
            "updatedAt": 1704067200000
        }
        """.data(using: .utf8)!)
    }
}
