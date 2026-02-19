package com.carrel.app.features.repositories

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.carrel.app.core.network.ConvexService
import com.carrel.app.core.network.models.LatexCacheMode
import com.carrel.app.core.network.models.Repository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RepositoryListUiState(
    val repositories: List<Repository> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isCheckingAll: Boolean = false,
    val refreshingRepoId: String? = null,
    val error: String? = null,
    val toastMessage: String? = null,
    val isBackgroundRefreshAllowed: Boolean = true,
    val backgroundRefreshDefault: Boolean = true,
    val userCacheMode: LatexCacheMode = LatexCacheMode.AUX,
    val isCompilationCacheAllowed: Boolean = true,
    val updatingRepoBackgroundId: String? = null,
    val updatingRepoCacheId: String? = null
)

class RepositoryListViewModel(
    private val convexService: ConvexService
) : ViewModel() {

    private val _uiState = MutableStateFlow(RepositoryListUiState())
    val uiState: StateFlow<RepositoryListUiState> = _uiState.asStateFlow()
    private var repositoriesSubscriptionJob: Job? = null

    init {
        loadPreferences()
    }

    fun loadRepositories() {
        if (repositoriesSubscriptionJob?.isActive == true) return

        repositoriesSubscriptionJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val user = convexService.getCurrentUser().getOrElse { exception ->
                Log.e(TAG, "Failed to resolve current user for repositories subscription", exception)
                _uiState.update { state ->
                    state.copy(
                        error = exception.message ?: "Failed to load repositories",
                        isLoading = false,
                        isRefreshing = false
                    )
                }
                return@launch
            }

            if (user == null) {
                _uiState.update { state ->
                    state.copy(
                        error = "Not authenticated",
                        isLoading = false,
                        isRefreshing = false
                    )
                }
                return@launch
            }

            try {
                convexService.subscribeToRepositories(user.id).collect { repositories ->
                    _uiState.update { state ->
                        state.copy(
                            repositories = repositories,
                            isLoading = false,
                            isRefreshing = false
                        )
                    }
                }
            } catch (exception: Exception) {
                Log.e(TAG, "Repositories subscription failed: ${exception.message}", exception)
                _uiState.update { state ->
                    state.copy(
                        error = exception.message ?: "Failed to subscribe to repositories",
                        isLoading = false,
                        isRefreshing = false
                    )
                }
            }
        }
    }

    private fun loadPreferences() {
        viewModelScope.launch {
            convexService.getCurrentUser()
                .onSuccess { user ->
                    _uiState.update {
                        it.copy(
                            userCacheMode = user?.latexCacheMode ?: LatexCacheMode.AUX,
                            isCompilationCacheAllowed = user?.latexCacheAllowed ?: true,
                            backgroundRefreshDefault = user?.backgroundRefreshDefault ?: true
                        )
                    }
                }

            convexService.getNotificationPreferences()
                .onSuccess { preferences ->
                    _uiState.update { it.copy(isBackgroundRefreshAllowed = preferences.backgroundSync) }
                }
        }
    }

    fun refresh() {
        if (repositoriesSubscriptionJob?.isActive == true) {
            _uiState.update { it.copy(isRefreshing = false) }
            return
        }
        _uiState.update { it.copy(isRefreshing = true) }
        loadRepositories()
    }

    fun checkAllRepositories() {
        if (_uiState.value.isCheckingAll) return

        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingAll = true) }

            convexService.checkAllRepositories()
                .onSuccess { result ->
                    val message = when {
                        result.failed > 0 -> "${result.failed} repos failed"
                        result.checked == 0 -> "All repos recently checked"
                        result.updated > 0 -> "${result.updated} repos updated"
                        else -> "All repos up to date"
                    }
                    _uiState.update { it.copy(toastMessage = message, isCheckingAll = false) }
                }
                .onFailure {
                    _uiState.update { it.copy(toastMessage = "Failed to check repos", isCheckingAll = false) }
                }
        }
    }

    fun refreshRepository(repository: Repository) {
        if (_uiState.value.refreshingRepoId != null) return

        viewModelScope.launch {
            _uiState.update { it.copy(refreshingRepoId = repository.id) }

            convexService.refreshRepository(repository.id)
                .onSuccess { result ->
                    val message = when {
                        result.skipped == true -> "Already syncing"
                        result.updated -> "Repository updated"
                        else -> "Already up to date"
                    }
                    _uiState.update { it.copy(toastMessage = message, refreshingRepoId = null) }
                    loadRepositories()
                }
                .onFailure { exception ->
                    val message = if (exception.message?.contains("Rate limit") == true) {
                        "Rate limited, try later"
                    } else {
                        "Failed to refresh"
                    }
                    _uiState.update { it.copy(toastMessage = message, refreshingRepoId = null) }
                }
        }
    }

    fun deleteRepository(repository: Repository) {
        viewModelScope.launch {
            _uiState.update { state ->
                state.copy(repositories = state.repositories.filter { it.id != repository.id })
            }

            convexService.deleteRepository(repository.id)
                .onSuccess {
                    _uiState.update { it.copy(toastMessage = "Repository deleted") }
                }
                .onFailure { exception ->
                    _uiState.update { it.copy(toastMessage = "Failed to delete", error = exception.message) }
                }
        }
    }

    fun setBackgroundRefresh(repository: Repository, enabled: Boolean?) {
        if (_uiState.value.updatingRepoBackgroundId != null) return

        viewModelScope.launch {
            _uiState.update { it.copy(updatingRepoBackgroundId = repository.id) }

            convexService.setBackgroundRefresh(repository.id, enabled)
                .onSuccess {
                    _uiState.update { state ->
                        state.copy(
                            repositories = state.repositories.map {
                                if (it.id == repository.id) it.copy(backgroundRefreshEnabled = enabled) else it
                            },
                            updatingRepoBackgroundId = null,
                            toastMessage = "Repository setting updated"
                        )
                    }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(
                            updatingRepoBackgroundId = null,
                            toastMessage = "Failed to update background refresh"
                        )
                    }
                }
        }
    }

    fun setCompilationCacheMode(repository: Repository, mode: LatexCacheMode?) {
        if (_uiState.value.updatingRepoCacheId != null) return

        viewModelScope.launch {
            _uiState.update { it.copy(updatingRepoCacheId = repository.id) }

            convexService.setRepositoryLatexCacheMode(repository.id, mode)
                .onSuccess {
                    _uiState.update { state ->
                        state.copy(
                            repositories = state.repositories.map {
                                if (it.id == repository.id) it.copy(latexCacheMode = mode) else it
                            },
                            updatingRepoCacheId = null,
                            toastMessage = "Repository setting updated"
                        )
                    }
                }
                .onFailure {
                    _uiState.update {
                        it.copy(
                            updatingRepoCacheId = null,
                            toastMessage = "Failed to update compilation cache"
                        )
                    }
                }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun clearToast() {
        _uiState.update { it.copy(toastMessage = null) }
    }

    override fun onCleared() {
        super.onCleared()
        repositoriesSubscriptionJob?.cancel()
    }

    companion object {
        private const val TAG = "RepositoryListViewModel"
    }
}
