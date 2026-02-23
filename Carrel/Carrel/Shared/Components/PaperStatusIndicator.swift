import SwiftUI

extension PaperStatus {
    func iconName(showsDownloadedIndicator: Bool = false) -> String {
        switch self {
        case .synced:
            return showsDownloadedIndicator ? "arrow.down.circle.fill" : "checkmark.circle.fill"
        case .pending:
            return "arrow.triangle.2.circlepath"
        case .building:
            return "ellipsis.circle.fill"
        case .error:
            return "exclamationmark.triangle.fill"
        case .uploaded, .unknown:
            return "doc.fill"
        }
    }

    func accessibilityLabel(showsDownloadedIndicator: Bool = false) -> String {
        switch self {
        case .synced:
            return showsDownloadedIndicator ? "downloaded" : "up to date"
        case .pending:
            return "needs sync"
        case .building:
            return "building"
        case .error:
            return "error"
        case .uploaded, .unknown:
            return "status unknown"
        }
    }
}

/// Rich status indicator for paper detail view, showing status icon and relative time
struct PaperStatusIndicator: View {
    let paper: Paper
    var showsDownloadedIndicator: Bool = false

    var body: some View {
        HStack(spacing: 6) {
            statusIcon
            Text(statusText)
                .font(.subheadline)
        }
        .foregroundStyle(statusColor)
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch paper.status {
        case .building:
            ProgressView()
                .scaleEffect(0.7)
        case .synced, .pending, .error, .uploaded, .unknown:
            Image(systemName: paper.status.iconName(showsDownloadedIndicator: showsDownloadedIndicator))
        }
    }

    private var statusText: String {
        switch paper.status {
        case .building:
            return paper.compilationProgress ?? "Compiling..."
        case .synced:
            if let commitTime = paper.lastAffectedCommitTime {
                return commitTime.relativeFormatted
            }
            return "Up to date"
        case .pending:
            if let commitTime = paper.lastAffectedCommitTime {
                return commitTime.relativeFormatted
            }
            return "Needs sync"
        case .error:
            if let error = paper.lastSyncError {
                if error.contains("not found") {
                    return "File missing"
                }
            }
            return "Sync failed"
        case .uploaded:
            return "Uploaded"
        case .unknown:
            return ""
        }
    }

    private var statusColor: Color {
        switch paper.status {
        case .synced:
            return .green
        case .pending:
            return .yellow
        case .building:
            return .blue
        case .error:
            return .red
        case .uploaded, .unknown:
            return .gray
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        PaperStatusIndicator(paper: Paper.preview)
        PaperStatusIndicator(paper: Paper.preview, showsDownloadedIndicator: true)
        PaperStatusIndicator(paper: Paper.previewError)
    }
    .padding()
}
