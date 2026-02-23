import SwiftUI

struct GalleryView: View {
    @State private var viewModel = GalleryViewModel()
    @State private var selectedPaper: Paper?
    @State private var openingPaperId: String?
    @State private var searchText = ""
    @State private var isOffline = false
    private let searchBarTopInset: CGFloat = 8

    private let columns = [
        GridItem(.adaptive(minimum: 160, maximum: 200), spacing: 16)
    ]

    /// Papers filtered by search text
    private var filteredPapers: [Paper] {
        if searchText.isEmpty {
            return viewModel.papers
        }
        return viewModel.papers.filter { paper in
            paper.title?.localizedCaseInsensitiveContains(searchText) ?? false
        }
    }

    private var operationStatus: (icon: String, text: String)? {
        if viewModel.isRefreshingAll, let progress = viewModel.refreshProgress {
            return ("play.fill", "Running \(progress.current)/\(progress.total)")
        }
        if viewModel.isSyncing {
            return ("arrow.triangle.2.circlepath", "Refreshing repositories")
        }
        return nil
    }

    var body: some View {
        galleryContent(viewModel: viewModel)
            .navigationTitle("Papers")
            .searchable(text: $searchText, prompt: "Search papers")
            .safeAreaInset(edge: .top) {
                VStack(spacing: 8) {
                    if let operationStatus {
                        GalleryOperationChip(icon: operationStatus.icon, text: operationStatus.text)
                            .padding(.horizontal, 16)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                    Color.clear.frame(height: searchBarTopInset)
                }
                .animation(GlassTheme.quickMotion, value: operationStatus?.text)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 12) {
                        Button {
                            HapticManager.impact(.light)
                            Task {
                                await viewModel.refreshAllPapers()
                            }
                        } label: {
                            if viewModel.isRefreshingAll {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "play.fill")
                            }
                        }
                        .disabled(viewModel.isRefreshingAll)
                        .help("Run refresh on papers that need sync")
                        .accessibilityLabel("Run papers")
                        .accessibilityHint("Run refresh on papers that need sync")

                        Button {
                            HapticManager.impact(.light)
                            Task {
                                await viewModel.checkAllRepositories()
                            }
                        } label: {
                            if viewModel.isSyncing {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath")
                            }
                        }
                        .disabled(viewModel.isSyncing)
                        .help("Refresh repositories")
                        .accessibilityLabel("Refresh repositories")
                        .accessibilityHint("Check all repositories for updates")
                    }
                }
            }
            .manageSubscription(viewModel)
            .sheet(item: $selectedPaper) { paper in
                NavigationStack {
                    PaperDetailView(paper: paper)
                }
            }
            .overlay(alignment: .top) {
                ToastContainer(message: $viewModel.toastMessage)
                    .padding(.top, 8)
            }
            .alert("Error", isPresented: Binding(
                get: { viewModel.error != nil },
                set: { if !$0 { viewModel.clearError() } }
            )) {
                Button("OK") {
                    viewModel.clearError()
                }
            } message: {
                Text(viewModel.error ?? "Unknown error")
            }
            .onReceive(NotificationCenter.default.publisher(for: .networkStatusChanged)) { notification in
                if let connected = notification.object as? Bool {
                    isOffline = !connected
                }
            }
            .onAppear {
                isOffline = !NetworkMonitor.shared.isConnected
            }
    }

    @ViewBuilder
    private func galleryContent(viewModel: GalleryViewModel) -> some View {
        if viewModel.isLoading && viewModel.papers.isEmpty {
            loadingSkeleton
        } else if viewModel.papers.isEmpty && !viewModel.isLoading {
            emptyState
        } else if filteredPapers.isEmpty && !searchText.isEmpty {
            ContentUnavailableView.search(text: searchText)
        } else {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(filteredPapers) { paper in
                        let isDeletingPaper = viewModel.deletingPaperIds.contains(paper.id)
                        let isOpening = openingPaperId == paper.id

                        PaperCard(
                            paper: paper,
                            isSyncing: viewModel.syncingPaperId == paper.id,
                            isOffline: isOffline,
                            isCached: viewModel.isPaperCached(paper.id)
                        )
                        .scaleEffect(isOpening ? 0.97 : 1.0)
                        .opacity(isOpening ? 0.68 : 1.0)
                        .animation(GlassTheme.quickMotion, value: openingPaperId)
                        .contentShape(Rectangle())
                        .highPriorityGesture(
                            TapGesture().onEnded {
                                openPaper(paper)
                            },
                            including: .gesture
                        )
                        .accessibilityIdentifier("gallery_paper_card_\(paper.id)")
                        .accessibilityAddTraits(.isButton)
                        .contextMenu {
                            Button {
                                Task {
                                    await viewModel.buildPaper(paper)
                                }
                            } label: {
                                Label("Sync", systemImage: "arrow.clockwise")
                            }

                            Button {
                                Task {
                                    await viewModel.buildPaper(paper, force: true)
                                }
                            } label: {
                                Label("Force Rebuild", systemImage: "hammer")
                            }

                            Divider()

                            Button(role: .destructive) {
                                Task {
                                    await viewModel.deletePaper(paper)
                                }
                            } label: {
                                if isDeletingPaper {
                                    Label("Deleting...", systemImage: "hourglass")
                                } else {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .disabled(isDeletingPaper)
                        }
                    }
                }
                .padding(16)
            }
            .refreshable {
                await viewModel.checkAllRepositories()
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Papers", systemImage: "doc.text")
        } description: {
            Text("Add repositories on the web to see your papers here.")
        }
    }

    private var loadingSkeleton: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(0..<6, id: \.self) { _ in
                    PaperCardSkeleton()
                }
            }
            .padding(16)
        }
        .allowsHitTesting(false)
    }

    private func openPaper(_ paper: Paper) {
        guard openingPaperId == nil else { return }

        HapticManager.impact(.light)
        withAnimation(GlassTheme.quickMotion) {
            openingPaperId = paper.id
        }

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(130))
            selectedPaper = paper
            withAnimation(GlassTheme.quickMotion) {
                openingPaperId = nil
            }
        }
    }
}

private struct GalleryOperationChip: View {
    let icon: String
    let text: String

    var body: some View {
        let shape = Capsule()

        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2.weight(.semibold))
            Text(text)
                .font(.caption.weight(.medium))
                .monospacedDigit()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .glassEffect(.regular.tint(GlassTheme.overlayTint), in: shape)
        .overlay {
            shape
                .strokeBorder(GlassTheme.overlayStroke.opacity(0.8), lineWidth: 0.8)
        }
        .foregroundStyle(.secondary)
    }
}

private struct PaperCardSkeleton: View {
    @State private var pulse = false

    var body: some View {
        let cardShape = RoundedRectangle(cornerRadius: GlassTheme.cardCornerRadius, style: .continuous)

        VStack(alignment: .leading, spacing: 0) {
            Rectangle()
                .fill(.quaternary.opacity(0.8))
                .frame(height: 200)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: GlassTheme.cardCornerRadius,
                        topTrailingRadius: GlassTheme.cardCornerRadius
                    )
                )

            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(.quaternary)
                    .frame(height: 14)
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(.quaternary.opacity(0.8))
                    .frame(width: 96, height: 10)
            }
            .padding(12)
        }
        .glassEffect(.regular.tint(GlassTheme.cardTint), in: cardShape)
        .overlay {
            cardShape
                .strokeBorder(GlassTheme.cardStroke, lineWidth: 0.8)
        }
        .opacity(pulse ? 0.55 : 0.85)
        .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
        .task {
            pulse = true
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    NavigationStack {
        GalleryView()
    }
}
