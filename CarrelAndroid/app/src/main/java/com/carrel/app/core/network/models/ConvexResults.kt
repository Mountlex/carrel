package com.carrel.app.core.network.models

import kotlinx.serialization.Serializable

@Serializable
class EmptyResult

@Serializable
data class TogglePublicResult(
    val isPublic: Boolean,
    val shareSlug: String? = null
)

@Serializable
data class CheckAllResult(
    @Serializable(with = FlexibleIntSerializer::class)
    val checked: Int,
    @Serializable(with = FlexibleIntSerializer::class)
    val updated: Int,
    @Serializable(with = FlexibleIntSerializer::class)
    val failed: Int
)

@Serializable
data class RefreshRepositoryResult(
    val updated: Boolean,
    val dateIsFallback: Boolean? = null,
    val skipped: Boolean? = null,
    val reason: String? = null,
    val commitHash: String? = null
)

@Serializable
data class AddTrackedFileResult(
    val trackedFileId: String,
    val paperId: String
)

@Serializable
data class TestNotificationResult(
    @Serializable(with = FlexibleIntSerializer::class)
    val delivered: Int,
    val reason: String? = null
)

@Serializable
data class TrackedFileInfo(
    @kotlinx.serialization.SerialName("_id") val id: String,
    val filePath: String
)

enum class Compiler(val displayName: String) {
    PDFLATEX("pdfLaTeX"),
    XELATEX("XeLaTeX"),
    LUALATEX("LuaLaTeX");

    val value: String get() = name.lowercase()
}
