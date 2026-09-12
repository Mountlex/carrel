import Foundation
import PDFKit
import UIKit
import Testing
@testable import Carrel

struct OfflineLibraryTests {
    private func paper() throws -> Paper {
        try JSONDecoder().decode(Paper.self, from: Data(#"{"_id":"paper","title":"Offline paper","pdfUrl":"https://example.com/paper.pdf","isUpToDate":true,"isPublic":false,"buildStatus":"idle","compilationProgress":"Complete","lastSyncError":"Previous build log","lastSyncedAt":1750000000123,"lastAffectedCommitTime":1750000000456,"lastAffectedCommitAuthor":"Author","createdAt":1740000000000,"updatedAt":1750000000000}"#.utf8))
    }

    @Test func fullPaperMetadataSurvivesAnAppRestart() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let expected = try paper()
        let first = LibraryStore(directory: directory)
        _ = await first.activate(accountID: "account-a")
        try await first.save([expected], accountID: "account-a")
        let restarted = LibraryStore(directory: directory)
        let restored = await restarted.activate(accountID: "account-a")
        #expect(restored == [expected])
    }

    @Test func accountsAreIsolatedAndSignOutRejectsLateWrites() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = LibraryStore(directory: directory)
        _ = await store.activate(accountID: "account-a")
        try await store.save([paper()], accountID: "account-a")
        #expect(await store.activate(accountID: "account-b") == [])
        try await store.save([], accountID: "account-a")
        #expect(await store.load(accountID: "account-a").count == 1)
        await store.clear(accountID: "account-a")
        try await store.save([paper()], accountID: "account-a")
        #expect(await store.load(accountID: "account-a") == [])
    }

    @Test @MainActor func validPDFIsAvailableWithoutNetworking() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = PDFCache(directory: directory)
        let url = URL(string: "https://offline.invalid/paper.pdf")!
        let data = pdfData()
        try await cache.cachePDF(data, for: url)
        #expect(try await cache.fetchPDF(from: url) == data)
        await cache.clearCache()
        #expect(await cache.getCachedPDF(for: url) == nil)
    }

    @Test func corruptResponsesNeverEnterTheCache() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = PDFCache(directory: directory)
        let url = URL(string: "https://example.com/paper.pdf")!
        do {
            try await cache.cachePDF(Data("<html>Server error</html>".utf8), for: url)
            Issue.record("An HTML error was accepted as a PDF")
        } catch PDFCacheError.invalidPDF { }
        #expect(await cache.isCached(url: url) == false)
    }

    @Test @MainActor func corruptDiskEntryIsEvictedBeforeRetry() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = PDFCache(directory: directory)
        let url = URL(string: "https://example.com/paper.pdf")!
        try await cache.cachePDF(pdfData(), for: url)
        let file = try #require(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
        try Data("broken".utf8).write(to: file)
        #expect(await cache.getCachedPDF(for: url) == nil)
        #expect(await cache.isCached(url: url) == false)
    }

    @Test func oversizeFilesAreRejected() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = PDFCache(directory: directory, maxFileSize: 100)
        do {
            try await cache.cachePDF(Data(repeating: 0, count: 101), for: URL(string: "https://example.com/large.pdf")!)
            Issue.record("An oversized file entered the cache")
        } catch PDFCacheError.fileTooLarge(let size) { #expect(size == 101) }
    }

    @MainActor private func pdfData() -> Data {
        UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 100, height: 100)).pdfData { context in
            context.beginPage()
            ("Carrel PDF" as NSString).draw(at: CGPoint(x: 10, y: 10), withAttributes: nil)
        }
    }
}
