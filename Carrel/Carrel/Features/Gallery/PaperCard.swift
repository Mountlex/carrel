import SwiftUI

struct PaperCard: View {
    let paper: Paper

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Thumbnail - content layer, no glass
            thumbnailView
                .frame(height: 200)
                .clipped()

            // Info section with glass backdrop
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top, spacing: 6) {
                    Text(paper.title ?? "Untitled")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(2)
                        .foregroundStyle(.primary)

                    Spacer()

                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                        .padding(.top, 4)
                }

                if let authors = paper.authors, !authors.isEmpty {
                    Text(authors)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(12)
        }
        .glassEffect(
            .regular.interactive(),
            in: RoundedRectangle(cornerRadius: 16)
        )
    }

    @ViewBuilder
    private var thumbnailView: some View {
        if let thumbnailUrl = paper.thumbnailUrl, let url = URL(string: thumbnailUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    Rectangle()
                        .fill(.quaternary)
                        .overlay {
                            ProgressView()
                        }

                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)

                case .failure:
                    placeholderView

                @unknown default:
                    placeholderView
                }
            }
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
            return .green
        case .pending, .building:
            return .yellow
        case .error:
            return .red
        case .unknown:
            return .gray
        }
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
            "authors": "John Doe, Jane Smith",
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
            "authors": "Test Author",
            "thumbnailUrl": null,
            "buildStatus": "error",
            "isPublic": false,
            "createdAt": 1704067200000,
            "updatedAt": 1704067200000
        }
        """.data(using: .utf8)!)
    }
}
