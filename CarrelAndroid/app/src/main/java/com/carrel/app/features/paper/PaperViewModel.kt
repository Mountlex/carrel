package com.carrel.app.features.paper

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.carrel.app.core.network.ConvexClient
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.models.Paper
import com.carrel.app.core.network.models.PaperStatus
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

data class PaperDetailUiState(
    val paper: Paper? = null,
    val isLoading: Boolean = false,
    val isBuilding: Boolean = false,
    val isTogglingPublic: Boolean = false,
    val error: String? = null
)

class PaperViewModel(
    private val paperId: String,
    private val convexClient: ConvexClient,
    private val convexService: ConvexService? = null,
    private val useConvexSubscriptions: Boolean = false
) : ViewModel() {

    private val _uiState = MutableStateFlow(PaperDetailUiState())
    val uiState: StateFlow<PaperDetailUiState> = _uiState.asStateFlow()
    private var subscriptionJob: Job? = null
    private val shouldUseSubscriptions = useConvexSubscriptions && convexService != null

    init {
        if (shouldUseSubscriptions) {
            observeConvexAuth()
        } else {
            loadPaper()
        }
    }

    /**
     * Start real-time subscription to the paper.
     */
    private fun startSubscription() {
        if (subscriptionJob?.isActive == true) return
        subscriptionJob?.cancel()
        _uiState.update { it.copy(isLoading = true, error = null) }

        subscriptionJob = viewModelScope.launch {
            try {
                convexService?.subscribeToPaper(paperId)
                    ?.collect { paper ->
                        _uiState.update { state ->
                            state.copy(
                                paper = paper,
                                isLoading = false,
                                // Clear building state when paper is no longer building
                                isBuilding = if (paper?.status != PaperStatus.BUILDING) false else state.isBuilding
                            )
                        }
                    }
            } catch (e: Exception) {
                _uiState.update { state ->
                    state.copy(
                        error = e.message,
                        isLoading = false
                    )
                }
            }
        }
    }

    /**
     * Wait for Convex auth before subscribing.
     * If Convex auth is not available, fall back to HTTP.
     */
    private fun observeConvexAuth() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            convexService?.isAuthenticated?.collect { isAuthenticated ->
                if (isAuthenticated) {
                    startSubscription()
                } else {
                    _uiState.update { it.copy(isLoading = true) }
                }
            }
        }
    }

    fun loadPaper() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            convexClient.paper(paperId)
                .onSuccess { paper ->
                    _uiState.update { state ->
                        state.copy(
                            paper = paper,
                            isLoading = false
                        )
                    }
                }
                .onError { exception ->
                    _uiState.update { state ->
                        state.copy(
                            error = exception.message,
                            isLoading = false
                        )
                    }
                }
        }
    }

    fun build(force: Boolean = false) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBuilding = true) }

            if (convexService != null) {
                convexService.buildPaper(paperId, force)
                    .onSuccess {
                        if (!shouldUseSubscriptions) {
                            loadPaper()
                            _uiState.update { it.copy(isBuilding = false) }
                        }
                    }
                    .onFailure { exception ->
                        _uiState.update { state ->
                            state.copy(
                                error = exception.message,
                                isBuilding = false
                            )
                        }
                    }
            } else {
                // Fallback to polling when no ConvexService available
                val pollingJob = viewModelScope.launch {
                    try {
                        withTimeout(BUILD_POLL_TIMEOUT_MS) {
                            var consecutiveErrors = 0
                            while (isActive) {
                                delay(BUILD_POLL_INTERVAL_MS)
                                var shouldStopPolling = false

                                convexClient.paper(paperId)
                                    .onSuccess { paper ->
                                        _uiState.update { it.copy(paper = paper) }
                                        consecutiveErrors = 0
                                        if (paper.compilationProgress == null && paper.status != PaperStatus.BUILDING) {
                                            shouldStopPolling = true
                                        }
                                    }
                                    .onError { exception ->
                                        consecutiveErrors += 1
                                        if (consecutiveErrors >= MAX_POLL_CONSECUTIVE_ERRORS) {
                                            throw IllegalStateException(
                                                exception.message ?: "Failed to refresh build status"
                                            )
                                        }
                                    }

                                if (shouldStopPolling) {
                                    return@withTimeout
                                }
                            }
                        }
                    } catch (_: TimeoutCancellationException) {
                        _uiState.update {
                            it.copy(error = "Build is taking longer than expected. Please try refreshing.")
                        }
                    } catch (e: Exception) {
                        _uiState.update {
                            it.copy(error = e.message ?: "Failed to refresh build status")
                        }
                    }
                }

                val buildResult = convexClient.buildPaper(paperId, force)
                buildResult.onError { exception ->
                    _uiState.update { state ->
                        state.copy(error = exception.message)
                    }
                    pollingJob.cancel()
                }

                pollingJob.join()
                loadPaper()
                _uiState.update { it.copy(isBuilding = false) }
            }
        }
    }

    fun updateMetadata(title: String?, authors: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            if (convexService != null) {
                convexService.updatePaper(paperId, title, authors)
                    .onSuccess {
                        if (!shouldUseSubscriptions) {
                            loadPaper()
                        }
                    }
                    .onFailure { exception ->
                        _uiState.update { state ->
                            state.copy(
                                error = exception.message,
                                isLoading = false
                            )
                        }
                    }
                // Subscription will update the paper
            } else {
                convexClient.updatePaper(paperId, title, authors)
                    .onSuccess {
                        loadPaper()
                    }
                    .onError { exception ->
                        _uiState.update { state ->
                            state.copy(
                                error = exception.message,
                                isLoading = false
                            )
                        }
                    }
            }
        }
    }

    fun togglePublic() {
        viewModelScope.launch {
            _uiState.update { it.copy(isTogglingPublic = true) }

            if (convexService != null) {
                convexService.togglePaperPublic(paperId)
                    .onSuccess {
                        if (shouldUseSubscriptions) {
                            _uiState.update { it.copy(isTogglingPublic = false) }
                        } else {
                            loadPaper()
                            _uiState.update { it.copy(isTogglingPublic = false) }
                        }
                    }
                    .onFailure { exception ->
                        _uiState.update { state ->
                            state.copy(
                                error = exception.message,
                                isTogglingPublic = false
                            )
                        }
                    }
            } else {
                convexClient.togglePaperPublic(paperId)
                    .onSuccess {
                        loadPaper()
                    }
                    .onError { exception ->
                        _uiState.update { state ->
                            state.copy(error = exception.message)
                        }
                    }

                _uiState.update { it.copy(isTogglingPublic = false) }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    override fun onCleared() {
        super.onCleared()
        subscriptionJob?.cancel()
    }

    companion object {
        private const val BUILD_POLL_INTERVAL_MS = 1500L
        private const val BUILD_POLL_TIMEOUT_MS = 120_000L
        private const val MAX_POLL_CONSECUTIVE_ERRORS = 3
    }
}
