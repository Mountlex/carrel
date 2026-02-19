package com.carrel.app.core.cache

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Lightweight disk cache for paper thumbnails with LRU eviction.
 */
class ThumbnailCache private constructor(private val cacheDir: File) {

    companion object {
        @Volatile
        private var instance: ThumbnailCache? = null

        private const val MAX_FILE_SIZE = 10 * 1024 * 1024L // 10MB
        private const val MAX_TOTAL_SIZE = 100 * 1024 * 1024L // 100MB

        fun getInstance(context: Context): ThumbnailCache {
            return instance ?: synchronized(this) {
                instance ?: ThumbnailCache(
                    File(context.cacheDir, "ThumbnailCache").also { it.mkdirs() }
                ).also { instance = it }
            }
        }
    }

    private val mutex = Mutex()

    fun isCached(url: String): Boolean = cacheFileFor(url).exists()

    suspend fun getCachedThumbnail(url: String): File? = withContext(Dispatchers.IO) {
        val cacheFile = cacheFileFor(url)
        if (!cacheFile.exists()) return@withContext null
        cacheFile.setLastModified(System.currentTimeMillis())
        cacheFile
    }

    suspend fun fetchThumbnail(url: String): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            getCachedThumbnail(url)?.let { return@runCatching it }

            val bytes = fetchWithRetry(url)
            if (bytes.size > MAX_FILE_SIZE) {
                throw ThumbnailCacheException.FileTooLarge(bytes.size)
            }

            mutex.withLock {
                evictIfNeeded(bytes.size.toLong())
            }

            val cacheFile = cacheFileFor(url)
            cacheFile.writeBytes(bytes)
            cacheFile
        }
    }

    suspend fun clearCache() = withContext(Dispatchers.IO) {
        mutex.withLock {
            cacheDir.listFiles()?.forEach { it.delete() }
        }
    }

    suspend fun cacheSize(): Long = withContext(Dispatchers.IO) {
        cacheDir.listFiles()?.sumOf { it.length() } ?: 0L
    }

    private suspend fun fetchWithRetry(url: String, maxRetries: Int = 3): ByteArray {
        var lastError: Exception? = null
        repeat(maxRetries) { attempt ->
            try {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 20_000
                    instanceFollowRedirects = true
                }
                try {
                    if (connection.responseCode !in 200..299) {
                        throw ThumbnailCacheException.NetworkError(
                            Exception("HTTP ${connection.responseCode}")
                        )
                    }
                    return connection.inputStream.use { stream ->
                        stream.readBytes()
                    }
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                lastError = e
                if (attempt < maxRetries - 1) {
                    kotlinx.coroutines.delay(400L * (attempt + 1))
                }
            }
        }
        throw ThumbnailCacheException.NetworkError(lastError ?: Exception("Unknown error"))
    }

    private fun cacheFileFor(url: String): File {
        val hash = Base64.encodeToString(url.toByteArray(), Base64.NO_WRAP or Base64.URL_SAFE)
            .replace("/", "_")
            .replace("+", "-")
            .take(100)
        return File(cacheDir, "$hash.thumb")
    }

    private fun evictIfNeeded(bytesNeeded: Long) {
        val currentSize = cacheDir.listFiles()?.sumOf { it.length() } ?: 0L
        val targetSize = MAX_TOTAL_SIZE - bytesNeeded
        if (currentSize <= targetSize) return

        val files = cacheDir.listFiles()
            ?.map { file -> file to file.lastModified() }
            ?.sortedBy { it.second }
            ?: return

        var freedBytes = 0L
        val bytesToFree = currentSize - targetSize
        for ((file, _) in files) {
            if (freedBytes >= bytesToFree) break
            val size = file.length()
            if (file.delete()) {
                freedBytes += size
            }
        }
    }
}

sealed class ThumbnailCacheException(message: String) : Exception(message) {
    class FileTooLarge(size: Int) : ThumbnailCacheException(
        "Thumbnail too large: ${size / 1024 / 1024}MB exceeds 10MB limit"
    )

    class NetworkError(cause: Exception) : ThumbnailCacheException(
        "Network error: ${cause.message}"
    )
}
