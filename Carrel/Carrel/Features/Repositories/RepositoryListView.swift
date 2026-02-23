import SwiftUI

struct RepositoryListView: View {
    @State private var viewModel = RepositoryViewModel()
    @State private var repositoryToDelete: Repository?
    @State private var selectedRepository: Repository?
    @State private var repositoryForSettings: Repository?

    var body: some View {
        repositoryListContent(viewModel: viewModel)
            .navigationTitle("Repositories")
            .navigationDestination(item: $selectedRepository) { repository in
                AddPaperFromRepoView(repository: repository)
            }
            .sheet(item: $repositoryForSettings) { repository in
                RepositorySettingsView(
                    repository: repository,
                    viewModel: viewModel,
                    userCacheMode: viewModel.userCacheMode,
                    isCompilationCacheAllowed: viewModel.isCompilationCacheAllowed,
                    backgroundRefreshDefault: viewModel.backgroundRefreshDefault,
                    isBackgroundRefreshAllowed: viewModel.isBackgroundRefreshAllowed
                )
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
            .onAppear {
                Task {
                    await viewModel.loadNotificationPreferences()
                    await viewModel.loadUserCacheMode()
                }
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task {
                            await viewModel.checkAllRepositories()
                        }
                    } label: {
                        if viewModel.isCheckingAll {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                        }
                    }
                    .disabled(viewModel.isCheckingAll)
                    .help("Check all repositories for updates")
                    .accessibilityLabel("Check repositories")
                    .accessibilityHint("Check all repositories for updates")
                }
            }
            .manageSubscription(viewModel)
            .confirmationDialog(
                "Delete Repository?",
                isPresented: .init(
                    get: { repositoryToDelete != nil },
                    set: { if !$0 { repositoryToDelete = nil } }
                ),
                presenting: repositoryToDelete
            ) { repo in
                Button("Delete", role: .destructive) {
                    Task {
                        await viewModel.deleteRepository(repo)
                    }
                }
                Button("Cancel", role: .cancel) {
                    repositoryToDelete = nil
                }
            } message: { repo in
                Text("This will also delete all \(repo.paperCount) tracked papers from \"\(repo.name)\". This action cannot be undone.")
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
    }

    @ViewBuilder
    private func repositoryListContent(viewModel: RepositoryViewModel) -> some View {
        if viewModel.repositories.isEmpty && !viewModel.isLoading {
            emptyState
        } else {
            VStack(spacing: 8) {
                if !viewModel.isBackgroundRefreshAllowed {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "clock.badge.xmark")
                            .foregroundStyle(.orange)
                        Text("Background refresh is paused in Settings.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                }

                List {
                    ForEach(viewModel.repositories) { repository in
                        let isRepoEnabled = repository.backgroundRefreshEnabled == true
                            || (repository.backgroundRefreshEnabled == nil && viewModel.backgroundRefreshDefault)
                        let isBackgroundRefreshActive = viewModel.isBackgroundRefreshAllowed && isRepoEnabled
                        RepositoryCard(
                            repository: repository,
                            isRefreshing: viewModel.refreshingRepoId == repository.id,
                            showsBackgroundRefreshBadge: isBackgroundRefreshActive,
                            onOpenSettings: {
                                let latest = viewModel.repositories.first(where: { $0.id == repository.id })
                                    ?? repository
                                repositoryForSettings = latest
                            }
                        )
                        .padding(.horizontal, 16)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedRepository = viewModel.repositories.first(where: { $0.id == repository.id })
                                ?? repository
                        }
                        .accessibilityIdentifier("repository_card_\(repository.id)")
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                        .swipeActions(edge: .leading, allowsFullSwipe: false) {
                            Button {
                                Task {
                                    await viewModel.refreshRepository(repository)
                                }
                            } label: {
                                Label("Update", systemImage: "arrow.clockwise")
                            }
                            .tint(GlassTheme.warning)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                repositoryToDelete = repository
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            .tint(GlassTheme.error)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable {
                    await viewModel.checkAllRepositories()
                }
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Repositories", systemImage: "folder")
        } description: {
            Text("Add repositories on the web to see them here.")
        }
    }
}

#Preview {
    NavigationStack {
        RepositoryListView()
    }
}

private struct RepositorySettingsView: View {
    let repository: Repository
    let viewModel: RepositoryViewModel
    let userCacheMode: LatexCacheMode
    let isCompilationCacheAllowed: Bool
    let backgroundRefreshDefault: Bool
    let isBackgroundRefreshAllowed: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var selection: RepoCacheSelection
    @State private var isUpdating = false
    @State private var backgroundRefreshSelection: RepoBackgroundRefreshSelection
    @State private var isUpdatingBackground = false

    init(
        repository: Repository,
        viewModel: RepositoryViewModel,
        userCacheMode: LatexCacheMode,
        isCompilationCacheAllowed: Bool,
        backgroundRefreshDefault: Bool,
        isBackgroundRefreshAllowed: Bool
    ) {
        self.repository = repository
        self.viewModel = viewModel
        self.userCacheMode = userCacheMode
        self.isCompilationCacheAllowed = isCompilationCacheAllowed
        self.backgroundRefreshDefault = backgroundRefreshDefault
        self.isBackgroundRefreshAllowed = isBackgroundRefreshAllowed
        self._selection = State(initialValue: RepoCacheSelection.from(mode: repository.latexCacheMode))
        self._backgroundRefreshSelection = State(
            initialValue: RepoBackgroundRefreshSelection.from(mode: repository.backgroundRefreshEnabled)
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                GlassBackdrop()
                ScrollView {
                    VStack(spacing: 20) {
                        GlassSection(title: "Compilation") {
                            VStack(alignment: .leading, spacing: 12) {
                                Picker("Compilation cache", selection: Binding(
                                    get: { selection },
                                    set: { newValue in
                                        updateSelection(newValue)
                                    }
                                )) {
                                    ForEach(RepoCacheSelection.allCases) { option in
                                        Text(option.displayName)
                                            .tag(option)
                                    }
                                }
                                .pickerStyle(.segmented)
                                .disabled(isUpdating)

                                Text("Default uses your global setting: \(userCacheMode.displayName).")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                Text("Stores LaTeX aux/out files to speed up rebuilds for this repository.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                if !isCompilationCacheAllowed {
                                    Text("Compilation cache is paused globally, so this repo will not use the cache until it's allowed.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        GlassSection(title: "Background Refresh") {
                            VStack(alignment: .leading, spacing: 12) {
                                Picker("Background refresh", selection: Binding(
                                    get: { backgroundRefreshSelection },
                                    set: { newValue in
                                        updateBackgroundRefresh(newValue)
                                    }
                                )) {
                                    ForEach(RepoBackgroundRefreshSelection.allCases) { option in
                                        Text(option.displayName)
                                            .tag(option)
                                    }
                                }
                                .pickerStyle(.segmented)
                                .disabled(isUpdatingBackground)

                                Text("Default uses your global setting: \(backgroundRefreshDefault ? "On" : "Off").")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                Text("Checks this repository for updates every 5 minutes while background refresh is allowed.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                if !isBackgroundRefreshAllowed {
                                    Text("Background refresh is paused globally, so this repo will not refresh until it's allowed.")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle(repository.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func updateSelection(_ newValue: RepoCacheSelection) {
        guard !isUpdating else { return }
        guard newValue != selection else { return }
        let previous = selection
        let requestedSelection = newValue
        selection = newValue
        isUpdating = true

        let requestedMode: LatexCacheMode?
        switch requestedSelection {
        case .inherit:
            requestedMode = nil
        case .off:
            requestedMode = .off
        case .aux:
            requestedMode = .aux
        }
        Task { @MainActor [requestedMode] in
            let success = await viewModel.setCompilationCacheMode(repositoryId: repository.id, mode: requestedMode)
            if !success {
                selection = previous
            }
            isUpdating = false
        }
    }

    private func updateBackgroundRefresh(_ newValue: RepoBackgroundRefreshSelection) {
        guard !isUpdatingBackground else { return }
        guard newValue != backgroundRefreshSelection else { return }
        let previous = backgroundRefreshSelection
        let requestedSelection = newValue
        backgroundRefreshSelection = newValue
        isUpdatingBackground = true

        let requestedMode: Bool?
        switch requestedSelection {
        case .inherit:
            requestedMode = nil
        case .off:
            requestedMode = false
        case .on:
            requestedMode = true
        }
        Task { @MainActor [requestedMode] in
            let success = await viewModel.setBackgroundRefresh(repositoryId: repository.id, enabled: requestedMode)
            if !success {
                backgroundRefreshSelection = previous
            }
            isUpdatingBackground = false
        }
    }
}

private enum RepoCacheSelection: String, CaseIterable, Identifiable {
    case inherit
    case off
    case aux

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .inherit:
            return "Default"
        case .off:
            return "Off"
        case .aux:
            return "On"
        }
    }

    static func from(mode: LatexCacheMode?) -> RepoCacheSelection {
        guard let mode else { return .inherit }
        return mode == .aux ? .aux : .off
    }
}

private enum RepoBackgroundRefreshSelection: String, CaseIterable, Identifiable {
    case inherit
    case off
    case on

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .inherit:
            return "Default"
        case .off:
            return "Off"
        case .on:
            return "On"
        }
    }

    static func from(mode: Bool?) -> RepoBackgroundRefreshSelection {
        guard let mode else { return .inherit }
        return mode ? .on : .off
    }
}
