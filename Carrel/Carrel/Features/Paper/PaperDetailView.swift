import SwiftUI
import PDFKit
import Combine

struct PaperDetailView: View {
    @State private var viewModel: PaperViewModel
    @State private var showingShareSheet = false
    @State private var showingEditSheet = false
    @State private var shareFileURL: URL?
    @State private var isPreparingShare = false
    @State private var subscriptionTask: Task<Void, Never>?
    @State private var pdfLoadError: String?
    @State private var toastMessage: ToastMessage?
    @State private var shareError: String?
    @State private var pdfReloadToken = 0
    @State private var isPaperCached = false
    @Environment(\.dismiss) private var dismiss

    init(paper: Paper) {
        _viewModel = State(initialValue: PaperViewModel(paper: paper))
    }

    private func copyShareLink() {
        guard let slug = viewModel.paper.shareSlug else { return }
        UIPasteboard.general.string = "https://carrelapp.com/share/\(slug)"
        toastMessage = ToastMessage(text: "Link copied!", type: .success)
        HapticManager.success()
    }

    private func prepareShareFile() async {
        guard let pdfUrlString = viewModel.paper.pdfUrl,
              let pdfUrl = URL(string: pdfUrlString) else { return }

        isPreparingShare = true
        defer { isPreparingShare = false }

        do {
            // Download the PDF
            let data = try await PDFCache.shared.fetchPDF(from: pdfUrl)

            // Create filename from paper title
            let title = viewModel.paper.title ?? "Paper"
            let sanitizedTitle = title
                .replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: ":", with: "-")
            let filename = "\(sanitizedTitle).pdf"

            // Save to temp directory
            let tempDir = FileManager.default.temporaryDirectory
            let fileURL = tempDir.appendingPathComponent(filename)
            try data.write(to: fileURL)

            shareFileURL = fileURL
            showingShareSheet = true
        } catch {
            #if DEBUG
            print("Failed to prepare share file: \(error)")
            #endif
            shareError = error.localizedDescription
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // PDF Viewer
            pdfViewer
                .frame(maxHeight: .infinity)

            // Info panel with glass effect
            infoPanel
        }
        .navigationTitle(viewModel.paper.title ?? "Paper")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") {
                    dismiss()
                }
                .accessibilityLabel("Done")
                .accessibilityHint("Close paper details")
            }

            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        Task {
                            await prepareShareFile()
                        }
                    } label: {
                        if isPreparingShare {
                            Label("Preparing...", systemImage: "ellipsis")
                        } else {
                            Label("Share PDF", systemImage: "square.and.arrow.up")
                        }
                    }
                    .disabled(viewModel.paper.pdfUrl == nil || isPreparingShare)

                    Button {
                        showingEditSheet = true
                    } label: {
                        Label("Edit Details", systemImage: "pencil")
                    }

                    Divider()

                    if viewModel.paper.isPublic {
                        Section("Public Link") {
                            Button {
                                copyShareLink()
                            } label: {
                                Label("Copy Link", systemImage: "link")
                            }

                            Button(role: .destructive) {
                                Task {
                                    await viewModel.togglePublic()
                                }
                            } label: {
                                Label("Make Private", systemImage: "lock")
                            }
                        }
                    }

                    Divider()

                    Button {
                        Task {
                            await viewModel.build()
                        }
                    } label: {
                        Label("Sync", systemImage: "arrow.clockwise")
                    }

                    Button {
                        Task {
                            await viewModel.build(force: true)
                        }
                    } label: {
                        Label("Force Rebuild", systemImage: "hammer")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("More options")
            }
        }
        .sheet(isPresented: $showingShareSheet, onDismiss: {
            // Clean up temp file after sharing
            if let fileURL = shareFileURL {
                try? FileManager.default.removeItem(at: fileURL)
                shareFileURL = nil
            }
        }) {
            if let fileURL = shareFileURL {
                ShareSheet(items: [fileURL])
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            EditPaperSheet(viewModel: viewModel)
        }
        .alert("Error", isPresented: Binding(get: { viewModel.error != nil }, set: { if !$0 { viewModel.clearError() } })) {
            Button("OK") {
                viewModel.clearError()
            }
        } message: {
            Text(viewModel.error ?? "Unknown error")
        }
        .alert("Share Failed", isPresented: Binding(get: { shareError != nil }, set: { if !$0 { shareError = nil } })) {
            Button("OK") {
                shareError = nil
            }
        } message: {
            Text(shareError ?? "Failed to prepare PDF for sharing")
        }
        .overlay(alignment: .top) {
            ToastContainer(message: $toastMessage)
                .padding(.top, 8)
        }
        .task {
            await startSubscription()
        }
        .task(id: viewModel.paper.pdfUrl) {
            await refreshPaperCacheState()
        }
        .onDisappear {
            subscriptionTask?.cancel()
            subscriptionTask = nil
        }
    }

    private func startSubscription() async {
        let paperId = viewModel.paper.id
        subscriptionTask = Task {
            do {
                let publisher = ConvexService.shared.subscribeToPaper(id: paperId)
                for try await updatedPaper in publisher.values {
                    guard !Task.isCancelled else { break }
                    viewModel.onPaperUpdate(updatedPaper)
                }
            } catch {
                if !Task.isCancelled {
                    #if DEBUG
                    print("PaperDetailView: Subscription error: \(error)")
                    #endif
                }
            }
        }
    }

    @ViewBuilder
    private var pdfViewer: some View {
        if let pdfUrl = viewModel.paper.pdfUrl, let url = URL(string: pdfUrl) {
            PDFViewerWithOfflineCheck(
                url: url,
                reloadToken: pdfReloadToken,
                onError: { error in
                    pdfLoadError = error
                },
                onLoaded: {
                    isPaperCached = true
                }
            )
            .alert("PDF Error", isPresented: Binding(get: { pdfLoadError != nil }, set: { if !$0 { pdfLoadError = nil } })) {
                Button("Retry") {
                    pdfLoadError = nil
                    pdfReloadToken += 1
                }
                Button("OK") {
                    pdfLoadError = nil
                }
            } message: {
                Text(pdfLoadError ?? "Failed to load PDF")
            }
        } else {
            ContentUnavailableView {
                Label("No PDF", systemImage: "doc.text.fill")
            } description: {
                Text("This paper doesn't have a PDF yet.")
            } actions: {
                Button("Build PDF") {
                    Task {
                        await viewModel.build()
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var infoPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(viewModel.paper.title ?? "Untitled")
                            .font(.headline)

                        if viewModel.paper.isPublic {
                            Image(systemName: "globe")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()

                if viewModel.isBuilding || viewModel.paper.buildStatus == "building" {
                    HStack(spacing: 6) {
                        ProgressView()
                            .scaleEffect(0.7)
                        Text(viewModel.paper.compilationProgress ?? "Building...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                } else {
                    // Use the rich status indicator for detail view
                    PaperStatusIndicator(
                        paper: viewModel.paper,
                        showsDownloadedIndicator: viewModel.paper.status == .synced && isPaperCached
                    )
                }
            }

            // Last commit info
            if viewModel.paper.lastAffectedCommitTime != nil || viewModel.paper.lastAffectedCommitAuthor != nil {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let commitTime = viewModel.paper.lastAffectedCommitTime {
                        Text(commitTime.relativeFormatted)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let author = viewModel.paper.lastAffectedCommitAuthor {
                        Text("by \(author)")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }

                    Spacer()
                }
            }
        }
        .padding(12)
        .glassEffect(.regular, in: Rectangle())
    }

    private func refreshPaperCacheState() async {
        guard let pdfUrlString = viewModel.paper.pdfUrl, let pdfUrl = URL(string: pdfUrlString) else {
            isPaperCached = false
            return
        }
        isPaperCached = await PDFCache.shared.isCached(url: pdfUrl)
    }
}

/// Wrapper that checks offline status before showing PDF
struct PDFViewerWithOfflineCheck: View {
    let url: URL
    let reloadToken: Int
    var onError: ((String) -> Void)?
    var onLoaded: (() -> Void)?

    @State private var showOfflineMessage = false
    @State private var networkReloadToken = 0

    var body: some View {
        Group {
            if showOfflineMessage {
                // Offline and not cached
                ContentUnavailableView {
                    Label("Not Available Offline", systemImage: "wifi.slash")
                } description: {
                    Text("This PDF hasn't been downloaded yet. Connect to the internet to view it.")
                }
            } else {
                // Show the PDF viewer - it will call onError if offline and not cached
                PDFViewerContainer(
                    url: url,
                    reloadToken: reloadToken + networkReloadToken,
                    onError: { error in
                        // Check if this is a network error while offline
                        if !NetworkMonitor.shared.isConnected {
                            showOfflineMessage = true
                        } else {
                            onError?(error)
                        }
                    },
                    onLoaded: {
                        onLoaded?()
                    }
                )
            }
        }
        .task {
            // Pre-check: if offline and not cached, show message immediately
            let isOffline = !NetworkMonitor.shared.isConnected
            if isOffline {
                let isCached = await PDFCache.shared.isCached(url: url)
                if !isCached {
                    showOfflineMessage = true
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .networkStatusChanged)) { notification in
            guard let isConnected = notification.object as? Bool else { return }
            Task { @MainActor in
                if isConnected {
                    showOfflineMessage = false
                    networkReloadToken += 1
                } else {
                    let isCached = await PDFCache.shared.isCached(url: url)
                    showOfflineMessage = !isCached
                }
            }
        }
    }
}

struct PDFViewerContainer: UIViewRepresentable {
    let url: URL
    let reloadToken: Int
    var onError: ((String) -> Void)?
    var onLoaded: (() -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.autoScales = true
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        return pdfView
    }

    func updateUIView(_ pdfView: PDFView, context: Context) {
        if context.coordinator.lastLoadedURL == url && context.coordinator.lastReloadToken == reloadToken {
            return
        }
        context.coordinator.lastLoadedURL = url
        context.coordinator.lastReloadToken = reloadToken

        // Cancel any existing load task
        context.coordinator.loadTask?.cancel()

        let errorHandler = onError
        let loadedHandler = onLoaded
        // Start new load task
        context.coordinator.loadTask = Task {
            do {
                guard !Task.isCancelled else { return }
                let data = try await PDFCache.shared.fetchPDF(from: url)
                guard !Task.isCancelled else { return }
                if let document = PDFDocument(data: data) {
                    await MainActor.run {
                        guard !Task.isCancelled else { return }
                        pdfView.document = document
                        loadedHandler?()
                    }
                } else {
                    await MainActor.run {
                        errorHandler?("Unable to open PDF. The file may be corrupted.")
                    }
                }
            } catch {
                if !Task.isCancelled {
                    await MainActor.run {
                        errorHandler?(error.localizedDescription)
                    }
                }
            }
        }
    }

    static func dismantleUIView(_ pdfView: PDFView, coordinator: Coordinator) {
        coordinator.loadTask?.cancel()
        coordinator.loadTask = nil
    }

    class Coordinator {
        var loadTask: Task<Void, Never>?
        var lastLoadedURL: URL?
        var lastReloadToken: Int?
    }
}

struct EditPaperSheet: View {
    @Bindable var viewModel: PaperViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var title: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Paper Details") {
                    TextField("Title", text: $title)
                }
            }
            .navigationTitle("Edit Paper")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await viewModel.updateMetadata(
                                title: title.isEmpty ? nil : title
                            )
                            dismiss()
                        }
                    }
                    .disabled(viewModel.isLoading)
                }
            }
            .onAppear {
                title = viewModel.paper.title ?? ""
            }
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
