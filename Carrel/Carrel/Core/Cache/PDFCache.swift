import Foundation
import PDFKit
import CryptoKit

nonisolated enum PDFCacheError: Error, LocalizedError {
    case invalidPDF
    case invalidURL
    case fileTooLarge(size: Int)
    case networkError(underlying: Error)
    case invalidResponse
    case badStatusCode(Int)

    var errorDescription: String? {
        switch self {
        case .invalidPDF:
            return "The downloaded file is not a readable PDF. Try downloading it again."
        case .invalidURL:
            return "Invalid URL for caching"
        case .fileTooLarge(let size):
            return "PDF file too large: \(size / 1024 / 1024)MB exceeds 50MB limit"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidResponse:
            return "Invalid response from server"
        case .badStatusCode(let statusCode):
            return "Server returned status \(statusCode)"
        }
    }

    var isRetryable: Bool {
        switch self {
        case .badStatusCode(let statusCode):
            return (500...599).contains(statusCode)
        case .invalidResponse, .fileTooLarge, .invalidURL, .invalidPDF:
            return false
        case .networkError:
            return true
        }
    }
}

actor PDFCache {
    static let shared = PDFCache()

    private let fileManager: FileManager
    private let cacheDirectory: URL
    private let maxFileSize: Int
    private let session: URLSession
    private var generation = 0
    private let maxTotalSize: Int64 = 500 * 1024 * 1024 // 500MB total cache limit

    init(directory: URL? = nil, session: URLSession = .shared, maxFileSize: Int = 50 * 1024 * 1024) {
        self.session = session
        self.maxFileSize = maxFileSize
        let fileManager = FileManager.default
        self.fileManager = fileManager

        // Get caches directory, fallback to temp directory if unavailable (extremely rare on iOS)
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        self.cacheDirectory = directory ?? caches.appendingPathComponent("PDFCache", isDirectory: true)

        // Create cache directory if needed
        try? fileManager.createDirectory(at: self.cacheDirectory, withIntermediateDirectories: true)
    }

    // Check if a PDF is cached without loading it
    func isCached(url: URL) -> Bool {
        let cacheFile = cacheFileURL(for: url)
        return fileManager.fileExists(atPath: cacheFile.path)
    }

    // Get cached PDF data if available
    func getCachedPDF(for url: URL) -> Data? {
        let cacheFile = cacheFileURL(for: url)
        guard fileManager.fileExists(atPath: cacheFile.path) else {
            return nil
        }

        // Update modification date for LRU tracking
        try? fileManager.setAttributes(
            [.modificationDate: Date()],
            ofItemAtPath: cacheFile.path
        )

        guard let size = try? cacheFile.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= maxFileSize,
              let data = try? Data(contentsOf: cacheFile), isValidPDF(data) else {
            try? fileManager.removeItem(at: cacheFile)
            return nil
        }
        return data
    }

    // Cache PDF data
    func cachePDF(_ data: Data, for url: URL) throws {
        guard data.count <= maxFileSize else { throw PDFCacheError.fileTooLarge(size: data.count) }
        guard isValidPDF(data) else { throw PDFCacheError.invalidPDF }
        // Evict old files if needed before caching new data
        evictIfNeeded(bytesNeeded: Int64(data.count))

        let cacheFile = cacheFileURL(for: url)
        try data.write(to: cacheFile, options: .atomic)
    }

    // Fetch PDF, using cache if available
    func fetchPDF(from url: URL, forceReload: Bool = false) async throws -> Data {
        let requestGeneration = generation
        if forceReload { invalidate(url: url) }
        try Task.checkCancellation()
        // Check cache first
        if let cached = getCachedPDF(for: url) {
            return cached
        }

        // Fetch from network with retry
        let data = try await fetchWithRetry(from: url)

        // Validate file size
        guard data.count <= maxFileSize else {
            throw PDFCacheError.fileTooLarge(size: data.count)
        }

        // Cache for next time
        try Task.checkCancellation()
        guard requestGeneration == generation else { throw CancellationError() }
        try cachePDF(data, for: url)

        return data
    }

    private func fetchWithRetry(from url: URL, maxRetries: Int = 3) async throws -> Data {
        var lastError: Error?
        for attempt in 0..<maxRetries {
            do {
                var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
                request.setValue("application/pdf", forHTTPHeaderField: "Accept")
                let (bytes, response) = try await session.bytes(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw PDFCacheError.invalidResponse
                }
                guard (200...299).contains(httpResponse.statusCode) else {
                    throw PDFCacheError.badStatusCode(httpResponse.statusCode)
                }
                if response.expectedContentLength > Int64(maxFileSize) {
                    throw PDFCacheError.fileTooLarge(size: Int(clamping: response.expectedContentLength))
                }
                var data = Data()
                for try await byte in bytes {
                    if data.count % 65_536 == 0 { try Task.checkCancellation() }
                    guard data.count < maxFileSize else { throw PDFCacheError.fileTooLarge(size: data.count + 1) }
                    data.append(byte)
                }
                guard isValidPDF(data) else { throw PDFCacheError.invalidPDF }
                return data
            } catch {
                if let cacheError = error as? PDFCacheError, !cacheError.isRetryable {
                    throw cacheError
                }
                lastError = error
                // Don't retry on cancellation
                if Task.isCancelled { throw error }
                // Wait before retry with exponential backoff
                if attempt < maxRetries - 1 {
                    try await Task.sleep(for: .milliseconds(500 * (attempt + 1)))
                }
            }
        }
        throw PDFCacheError.networkError(underlying: lastError ?? URLError(.unknown))
    }

    private func isValidPDF(_ data: Data) -> Bool {
        guard data.count <= maxFileSize, let document = PDFDocument(data: data) else { return false }
        return document.pageCount > 0
    }

    func invalidate(url: URL) {
        try? fileManager.removeItem(at: cacheFileURL(for: url))
    }

    // Clear all cached PDFs and prevent in-flight downloads from restoring them.
    func clearCache() {
        generation += 1
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
        let hash = SHA256
            .hash(data: Data(url.absoluteString.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return cacheDirectory.appendingPathComponent("\(hash).pdf")
    }

    // MARK: - LRU Eviction

    /// Evict oldest files until cache is under the size limit
    private func evictIfNeeded(bytesNeeded: Int64 = 0) {
        let currentSize = cacheSize()
        let targetSize = maxTotalSize - bytesNeeded

        guard currentSize > targetSize else { return }

        // Get all files with their modification dates
        guard let files = try? fileManager.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]
        ) else { return }

        // Sort by modification date (oldest first) for LRU eviction
        let sortedFiles = files.compactMap { url -> (url: URL, date: Date, size: Int64)? in
            guard let values = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]),
                  let date = values.contentModificationDate,
                  let size = values.fileSize else { return nil }
            return (url, date, Int64(size))
        }.sorted { $0.date < $1.date }

        var freedBytes: Int64 = 0
        let bytesToFree = currentSize - targetSize

        for file in sortedFiles {
            guard freedBytes < bytesToFree else { break }
            try? fileManager.removeItem(at: file.url)
            freedBytes += file.size
        }
    }
}
