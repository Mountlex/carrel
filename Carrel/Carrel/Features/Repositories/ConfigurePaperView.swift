import SwiftUI

struct ConfigurePaperSheet: View {
    let repository: Repository
    let filePath: String
    let onDismiss: () -> Void

    @State private var title: String
    @State private var compiler: Compiler = .pdflatex
    @State private var isAdding = false
    @State private var toastMessage: ToastMessage?
    @FocusState private var focusedField: Field?

    @Environment(\.dismiss) private var dismiss

    init(repository: Repository, filePath: String, onDismiss: @escaping () -> Void) {
        self.repository = repository
        self.filePath = filePath
        self.onDismiss = onDismiss

        // Auto-populate title from filename
        let filename = filePath.split(separator: "/").last.map(String.init) ?? filePath
        if let dotIndex = filename.lastIndex(of: ".") {
            self._title = State(initialValue: String(filename[..<dotIndex]))
        } else {
            self._title = State(initialValue: filename)
        }
    }

    private var isTexFile: Bool {
        filePath.lowercased().hasSuffix(".tex")
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canAddPaper: Bool {
        !trimmedTitle.isEmpty && !isAdding
    }

    private enum Field {
        case title
    }

    var body: some View {
        NavigationStack {
            ZStack {
                GlassBackdrop()
                ScrollView {
                    VStack(spacing: 20) {
                        GlassSection {
                            HStack(spacing: 12) {
                                Image(systemName: isTexFile ? "doc.text.fill" : "doc.fill")
                                    .font(.title2)
                                    .foregroundStyle(isTexFile ? .green : .red)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(filePath.split(separator: "/").last.map(String.init) ?? filePath)
                                        .font(.headline)

                                    Text(filePath)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                            }
                        }

                        GlassSection(title: "Paper Details") {
                            VStack(spacing: 12) {
                                TextField("Title", text: $title)
                                    .textFieldStyle(.roundedBorder)
                                    .focused($focusedField, equals: .title)
                                    .textInputAutocapitalization(.words)
                                    .autocorrectionDisabled(true)
                                    .submitLabel(.done)
                                    .onSubmit {
                                        focusedField = nil
                                    }

                                if isTexFile {
                                    Picker("Compiler", selection: $compiler) {
                                        ForEach(Compiler.allCases) { compiler in
                                            Text(compiler.displayName).tag(compiler)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 96)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Add Paper")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedField = nil
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                addButtonBar
            }
            .overlay(alignment: .top) {
                ToastContainer(message: $toastMessage)
                    .padding(.top, 8)
            }
        }
        .task {
            // Give the sheet a short moment to settle before focusing for smoother animation.
            try? await Task.sleep(for: .milliseconds(150))
            if !isAdding {
                focusedField = .title
            }
        }
    }

    private var addButtonBar: some View {
        HStack {
            Button {
                focusedField = nil
                Task {
                    await handleAddButtonTap()
                }
            } label: {
                HStack {
                    Spacer()
                    if isAdding {
                        ProgressView()
                            .scaleEffect(0.8)
                            .padding(.trailing, 8)
                    }
                    Text(isAdding ? "Adding..." : "Add Paper")
                        .fontWeight(.semibold)
                    Spacer()
                }
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.liquidGlass)
            .disabled(isAdding)
            .opacity(canAddPaper ? 1 : 0.75)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(.clear)
    }

    @MainActor
    private func handleAddButtonTap() async {
        guard !isAdding else { return }
        guard !trimmedTitle.isEmpty else {
            HapticManager.buildError()
            toastMessage = ToastMessage(text: "Enter a paper title", type: .error)
            return
        }
        HapticManager.impact(.light)
        await addPaper()
    }

    @MainActor
    private func addPaper() async {
        guard canAddPaper else { return }

        isAdding = true

        do {
            let pdfSourceType = isTexFile ? "compile" : "committed"
            let compilerValue = isTexFile ? compiler.rawValue : nil
            let safeTitle = trimmedTitle

            let result = try await ConvexService.shared.addTrackedFile(
                repositoryId: repository.id,
                filePath: filePath,
                title: safeTitle,
                pdfSourceType: pdfSourceType,
                compiler: compilerValue
            )

            // Trigger build in the background (don't wait)
            let paperId = result.paperId
            Task {
                try? await ConvexService.shared.buildPaper(id: paperId)
            }

            // Dismiss immediately after paper is created
            HapticManager.buildSuccess()
            dismiss()
            onDismiss()
        } catch {
            let message = error.localizedDescription.contains("already exists")
                ? "File already tracked"
                : "Failed to add paper"
            HapticManager.buildError()
            toastMessage = ToastMessage(text: message, type: .error)
            print("ConfigurePaperSheet: Failed to add paper: \(error)")
            isAdding = false
        }
    }
}

#Preview {
    ConfigurePaperSheet(repository: .preview, filePath: "src/main.tex", onDismiss: {})
}
