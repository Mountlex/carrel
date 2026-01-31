import Foundation
import PDFKit

actor PDFCache {
    static let shared = PDFCache()

    private let fileManager = FileManager.default
    private let cacheDirectory: URL

    private init() {
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("PDFCache", isDirectory: true)

        // Create cache directory if needed
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // Get cached PDF data if available
    func getCachedPDF(for url: URL) -> Data? {
        let cacheFile = cacheFileURL(for: url)
        guard fileManager.fileExists(atPath: cacheFile.path) else {
            return nil
        }
        return try? Data(contentsOf: cacheFile)
    }

    // Cache PDF data
    func cachePDF(_ data: Data, for url: URL) {
        let cacheFile = cacheFileURL(for: url)
        try? data.write(to: cacheFile)
    }

    // Fetch PDF, using cache if available
    func fetchPDF(from url: URL) async throws -> Data {
        // Check cache first
        if let cached = getCachedPDF(for: url) {
            return cached
        }

        // Fetch from network
        let (data, _) = try await URLSession.shared.data(from: url)

        // Cache for next time
        cachePDF(data, for: url)

        return data
    }

    // Clear all cached PDFs
    func clearCache() {
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // Get cache size in bytes
    func cacheSize() -> Int64 {
        guard let files = try? fileManager.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey]) else {
            return 0
        }

        return files.reduce(0) { total, file in
            let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            return total + Int64(size)
        }
    }

    private func cacheFileURL(for url: URL) -> URL {
        // Use URL hash as filename to avoid path issues
        let hash = url.absoluteString.data(using: .utf8)!.base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
        return cacheDirectory.appendingPathComponent("\(hash).pdf")
    }
}
