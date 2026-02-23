import SwiftUI

struct StatusBadge: View {
    let status: PaperStatus

    var body: some View {
        HStack(spacing: 4) {
            if status == .building {
                ProgressView()
                    .scaleEffect(0.5)
                    .frame(width: 10, height: 10)
            } else {
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
            }

            Text(statusText)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .glassEffect(
            .regular.tint(statusColor.opacity(0.25)),
            in: Capsule()
        )
        .foregroundStyle(statusColor)
    }

    private var statusColor: Color {
        switch status {
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

    private var statusText: String {
        switch status {
        case .synced:
            return "Synced"
        case .pending:
            return "Pending"
        case .building:
            return "Building"
        case .error:
            return "Error"
        case .uploaded:
            return "Uploaded"
        case .unknown:
            return "Unknown"
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        StatusBadge(status: .synced)
        StatusBadge(status: .pending)
        StatusBadge(status: .building)
        StatusBadge(status: .error)
        StatusBadge(status: .uploaded)
        StatusBadge(status: .unknown)
    }
    .padding()
    .background(Color.gray.opacity(0.3))
}
