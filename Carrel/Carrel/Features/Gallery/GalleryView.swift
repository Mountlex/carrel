import SwiftUI

struct GalleryView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var paperToDelete: Paper?
    @Environment(AppNavigationCoordinator.self) private var appNavigation
    @State private var viewModel = GalleryViewModel()
    @State private var selectedPaper: Paper?
    @State private var openingPaperId: String?
    @State private var pendingPaperLookupID: String?
    @State private var searchText = ""
    @State private var isOffline = false
    private let searchBarTopInset: CGFloat = 8

    private var columns: [GridItem] {
        dynamicTypeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 160, maximum: 240), spacing: 16)]
    }

    /// Papers filtered by search text
    private var filteredPapers: [Paper] {
        let papers = viewModel.papers
        if searchText.isEmpty { return papers }
        return papers.filter { paper in
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
            .background { GlassBackdrop() }
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
            .task(id: authManager.userID) {
                await viewModel.loadCachedLibrary(userID: authManager.userID)
                await viewModel.runSubscription()
            }
            .confirmationDialog("Delete paper?", isPresented: Binding(
                get: { paperToDelete != nil }, set: { if !$0 { paperToDelete = nil } }
            ), presenting: paperToDelete) { paper in
                Button("Delete Paper", role: .destructive) {
                    Task { await viewModel.deletePaper(paper) }
                }
            } message: { paper in
                Text("Remove \(paper.title ?? "this paper") from Carrel? Your original repository file is kept. This cannot be undone.")
            }
            .sheet(item: $selectedPaper, onDismiss: { viewModel.refreshCacheState() }) { paper in
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
                handlePendingPaperNavigation()
            }
            .onChange(of: appNavigation.pendingPaperID) { _, _ in
                handlePendingPaperNavigation()
            }
            .onChange(of: viewModel.papers) { _, _ in
                handlePendingPaperNavigation()
            }
            .onChange(of: viewModel.isLoading) { _, isLoading in
                guard !isLoading else { return }
                handlePendingPaperNavigation()
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

                        Button { openPaper(paper) } label: {
                        PaperCard(
                            paper: paper,
                            isSyncing: viewModel.syncingPaperId == paper.id,
                            isOffline: isOffline || authManager.isUsingCachedSession,
                            isCached: viewModel.isPaperCached(paper.id)
                        )
                        .scaleEffect(isOpening ? 0.97 : 1.0)
                        .opacity(isOpening ? 0.68 : 1.0)
                        .animation(reduceMotion ? nil : GlassTheme.quickMotion, value: openingPaperId)
                        .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
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
                                paperToDelete = paper
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
            Text("Connect a repository to bring your papers into Carrel.")
        } actions: {
            Link("Add Repository", destination: AuthManager.siteURL.appendingPathComponent("repositories"))
                .buttonStyle(.borderedProminent)
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
        withAnimation(reduceMotion ? nil : GlassTheme.quickMotion) {
            openingPaperId = paper.id
        }

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(130))
            selectedPaper = paper
            withAnimation(reduceMotion ? nil : GlassTheme.quickMotion) {
                openingPaperId = nil
            }
        }
    }

    private func handlePendingPaperNavigation() {
        guard let pendingPaperID = appNavigation.pendingPaperID else {
            pendingPaperLookupID = nil
            return
        }

        if selectedPaper?.id == pendingPaperID {
            appNavigation.consumePendingPaper(id: pendingPaperID)
            return
        }

        if let paper = viewModel.papers.first(where: { $0.id == pendingPaperID }) {
            pendingPaperLookupID = nil
            appNavigation.consumePendingPaper(id: pendingPaperID)
            openPaper(paper)
            return
        }

        guard !viewModel.isLoading, pendingPaperLookupID != pendingPaperID else { return }
        pendingPaperLookupID = pendingPaperID

        Task { @MainActor in
            defer {
                if pendingPaperLookupID == pendingPaperID {
                    pendingPaperLookupID = nil
                }
            }

            do {
                let paper = try await ConvexService.shared.getPaper(id: pendingPaperID)
                guard appNavigation.pendingPaperID == pendingPaperID else { return }
                appNavigation.consumePendingPaper(id: pendingPaperID)
                openPaper(paper)
            } catch {
                #if DEBUG
                print("GalleryView: Failed to resolve notification paper \(pendingPaperID): \(error)")
                #endif
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
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
        .opacity(pulse ? 0.55 : 0.85)
        .modifier(GlassCardSurface())
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
        .task {
            pulse = !reduceMotion
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    NavigationStack {
        GalleryView()
    }
}
