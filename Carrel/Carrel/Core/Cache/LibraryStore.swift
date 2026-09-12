import Foundation
import CryptoKit

/// An account-scoped index makes cached documents discoverable after restarting offline.
actor LibraryStore {
    static let shared = LibraryStore()
    private let directory: URL
    private var activeAccount: String?

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PaperLibrary", isDirectory: true)
    }

    func activate(accountID: String) -> [Paper] {
        guard !Task.isCancelled else { return [] }
        activeAccount = accountID
        return load(accountID: accountID)
    }

    func load(accountID: String) -> [Paper] {
        guard let data = try? Data(contentsOf: fileURL(accountID: accountID)),
              let papers = try? JSONDecoder().decode([Paper].self, from: data) else { return [] }
        return papers
    }

    func save(_ papers: [Paper], accountID: String) throws {
        guard activeAccount == accountID, !Task.isCancelled else { return }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(papers).write(to: fileURL(accountID: accountID), options: .atomic)
    }

    func clear(accountID: String?) {
        activeAccount = nil
        if let accountID {
            try? FileManager.default.removeItem(at: fileURL(accountID: accountID))
        }
    }

    private func fileURL(accountID: String) -> URL {
        let key = SHA256.hash(data: Data(accountID.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(key).appendingPathExtension("json")
    }
}
