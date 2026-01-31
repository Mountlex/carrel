import SwiftUI

struct GalleryView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var viewModel: GalleryViewModel?
    @State private var selectedPaper: Paper?
    @State private var refreshRotation: Double = 0

    private let columns = [
        GridItem(.adaptive(minimum: 160, maximum: 200), spacing: 16)
    ]

    var body: some View {
        Group {
            if let viewModel = viewModel {
                galleryContent(viewModel: viewModel)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Papers")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if viewModel?.isLoading == true && viewModel?.isRefreshing == false {
                    ProgressView()
                } else {
                    Button {
                        Task {
                            await viewModel?.refresh()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .task {
            if viewModel == nil {
                viewModel = GalleryViewModel(authManager: authManager)
            }
            await viewModel?.loadPapers()
        }
        .sheet(item: $selectedPaper) { paper in
            NavigationStack {
                PaperDetailView(paper: paper, authManager: authManager)
            }
        }
    }

    @ViewBuilder
    private func galleryContent(viewModel: GalleryViewModel) -> some View {
        if viewModel.papers.isEmpty && !viewModel.isLoading {
            emptyState
        } else {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(viewModel.papers) { paper in
                        PaperCard(paper: paper)
                            .onTapGesture {
                                selectedPaper = paper
                            }
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
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
                .padding()
            }
            .refreshable {
                await viewModel.refresh()
            }
            .overlay(alignment: .top) {
                if viewModel.isRefreshing {
                    RefreshIndicator(rotation: $refreshRotation)
                        .padding(.top, 60)
                }
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
}

struct RefreshIndicator: View {
    @Binding var rotation: Double

    var body: some View {
        Image(systemName: "arrow.clockwise")
            .font(.title2)
            .rotationEffect(.degrees(rotation))
            .onAppear {
                withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
            .onDisappear {
                rotation = 0
            }
            .padding(12)
            .glassEffect(.regular, in: Circle())
    }
}

#Preview {
    NavigationStack {
        GalleryView()
    }
    .environment(AuthManager())
}
