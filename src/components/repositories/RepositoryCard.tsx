import { useState, memo, useEffect } from "react";
import type { Repository } from "./types";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatDateTime } from "../../lib/formatters";
import { getProviderLabel } from "../../lib/providers";

interface RepositoryCardProps {
  repo: Repository;
  isSyncing: boolean;
  onSync: (repoId: Id<"repositories">) => void;
  onDelete: (repoId: Id<"repositories">) => void;
  onConfigure: (repo: Repository) => void;
  onUpdateName: (repoId: Id<"repositories">, name: string) => Promise<void>;
  onUpdateBackgroundRefresh: (repoId: Id<"repositories">, mode: boolean | null) => Promise<boolean>;
  onUpdateCacheMode: (repoId: Id<"repositories">, mode: "off" | "aux" | null) => Promise<boolean>;
}

function formatProviderName(provider: string): string {
  if (provider === "selfhosted-gitlab") return "Self-hosted";
  return getProviderLabel(provider);
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
    </svg>
  );
}

function OverleafIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-4-2-7-6-7-10 0-3 2-6 5-7 1.5 3 4 5 7 5 0 4-2 9-5 12z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21V11" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  switch (provider) {
    case "github":
      return <GitHubIcon className={className} />;
    case "gitlab":
      return <GitLabIcon className={className} />;
    case "overleaf":
      return <OverleafIcon className={className} />;
    case "selfhosted-gitlab":
      return <ServerIcon className={className} />;
    default:
      return <ServerIcon className={className} />;
  }
}

export function RepositoryCard({
  repo,
  isSyncing,
  onSync,
  onDelete,
  onConfigure,
  onUpdateName,
  onUpdateBackgroundRefresh,
  onUpdateCacheMode,
}: RepositoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(repo.name);
  const [showSettings, setShowSettings] = useState(false);
  const [isUpdatingBackground, setIsUpdatingBackground] = useState(false);
  const [isUpdatingCache, setIsUpdatingCache] = useState(false);
  const [backgroundRefreshMode, setBackgroundRefreshMode] = useState<boolean | null>(
    repo.backgroundRefreshEnabled ?? null
  );
  const [cacheMode, setCacheMode] = useState<"off" | "aux" | null>(
    repo.latexCacheMode ?? null
  );
  const lastCheckedLabel = repo.lastSyncedAt
    ? formatDateTime(repo.lastSyncedAt)
    : "Never";
  const backgroundRefreshValue =
    backgroundRefreshMode === null ? "inherit" : backgroundRefreshMode ? "on" : "off";

  useEffect(() => {
    setBackgroundRefreshMode(repo.backgroundRefreshEnabled ?? null);
    setCacheMode(repo.latexCacheMode ?? null);
  }, [repo.backgroundRefreshEnabled, repo.latexCacheMode]);

  const handleSave = async () => {
    if (!editName.trim()) return;
    await onUpdateName(repo._id, editName.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(repo.name);
    setIsEditing(false);
  };

  const handleBackgroundRefreshChange = async (nextValue: boolean | null) => {
    if (isUpdatingBackground) return;
    const previous = backgroundRefreshMode;
    setBackgroundRefreshMode(nextValue);
    setIsUpdatingBackground(true);
    try {
      const succeeded = await onUpdateBackgroundRefresh(repo._id, nextValue);
      if (!succeeded) {
        setBackgroundRefreshMode(previous);
      }
    } finally {
      setIsUpdatingBackground(false);
    }
  };

  const handleCacheModeChange = async (nextValue: "off" | "aux" | null) => {
    if (isUpdatingCache) return;
    const previous = cacheMode;
    setCacheMode(nextValue);
    setIsUpdatingCache(true);
    try {
      const succeeded = await onUpdateCacheMode(repo._id, nextValue);
      if (!succeeded) {
        setCacheMode(previous);
      }
    } finally {
      setIsUpdatingCache(false);
    }
  };

  return (
    <div className="group rounded-xl border border-gray-200/60 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800/60 dark:bg-gray-900">
      {/* Main row */}
      <div className="flex items-center gap-3 p-4 md:gap-4">
        {/* Provider Icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <ProviderIcon provider={repo.provider} className="h-4 w-4" />
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
                autoFocus
                className="w-full rounded-lg border border-primary-300 bg-primary-50 px-2.5 py-1 text-sm font-medium focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-primary-700 dark:bg-primary-950 dark:text-gray-100"
              />
              <button
                onClick={handleSave}
                className="rounded p-1 text-success-600 hover:bg-success-50 dark:text-success-400 dark:hover:bg-success-500/20"
                title="Save"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={handleCancel}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Cancel"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditName(repo.name);
                  setIsEditing(true);
                }}
                className="group/name flex items-center gap-1 text-left"
                title="Click to rename"
              >
                <h3 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{repo.name}</h3>
                <svg className="h-3 w-3 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover/name:opacity-100 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <SyncStatusBadge repo={repo} />
              {repo.syncStatus === "error" && (
                <button
                  onClick={() => onSync(repo._id)}
                  disabled={isSyncing}
                  className="text-[11px] text-danger-600 hover:text-danger-700 disabled:opacity-50 dark:text-danger-400"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Provider · URL · meta */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-xs text-gray-400 dark:text-gray-500">
            <span className="text-gray-500 dark:text-gray-400">{formatProviderName(repo.provider)}</span>
            <span className="text-gray-300 dark:text-gray-700">&middot;</span>
            <span className="hidden truncate sm:inline">{repo.gitUrl}</span>
            <span className="text-gray-300 dark:text-gray-700">&middot;</span>
            <span>{repo.paperCount} {repo.paperCount === 1 ? "paper" : "papers"}</span>
            {repo.papersWithErrors > 0 && (
              <>
                <span className="text-gray-300 dark:text-gray-700">&middot;</span>
                <span className="text-danger-500 dark:text-danger-400">
                  {repo.papersWithErrors} {repo.papersWithErrors === 1 ? "error" : "errors"}
                </span>
              </>
            )}
            <span className="text-gray-300 dark:text-gray-700">&middot;</span>
            <span>Checked {lastCheckedLabel}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Add Papers */}
          <button
            onClick={() => onConfigure(repo)}
            className="hidden items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs text-white transition-colors hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 sm:inline-flex"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Papers
          </button>
          {/* Add Papers - mobile icon only */}
          <button
            onClick={() => onConfigure(repo)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10 sm:hidden"
            title="Add papers"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Check */}
          <button
            onClick={() => onSync(repo._id)}
            disabled={isSyncing}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title="Check for updates"
          >
            {isSyncing ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
          </button>

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              showSettings
                ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            }`}
            title="Repository settings"
            aria-expanded={showSettings}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={() => onDelete(repo._id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-danger-50 hover:text-danger-500 dark:hover:bg-danger-500/10 dark:hover:text-danger-400"
            title="Delete repository"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsible settings */}
      {showSettings && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800/60">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Background refresh</span>
              <select
                value={backgroundRefreshValue}
                onChange={(e) => {
                  const value = e.target.value;
                  const nextValue = value === "inherit" ? null : value === "on";
                  handleBackgroundRefreshChange(nextValue);
                }}
                disabled={isUpdatingBackground}
                className="rounded-md border border-gray-200/60 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary-500 focus:outline-none dark:border-gray-700/60 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="inherit">Default</option>
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Compilation cache</span>
              <select
                value={cacheMode ?? "inherit"}
                onChange={(e) => {
                  const value = e.target.value;
                  handleCacheModeChange(value === "inherit" ? null : (value as "off" | "aux"));
                }}
                disabled={isUpdatingCache}
                className="rounded-md border border-gray-200/60 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary-500 focus:outline-none dark:border-gray-700/60 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="inherit">Default</option>
                <option value="off">Off</option>
                <option value="aux">On (Aux)</option>
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

const SyncStatusBadge = memo(function SyncStatusBadge({ repo }: { repo: Repository }) {
  if (repo.syncStatus === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Checking
      </span>
    );
  }
  if (repo.syncStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-medium text-danger-700 dark:bg-danger-500/10 dark:text-danger-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Sync failed
      </span>
    );
  }
  if (repo.paperSyncStatus === "in_sync") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Up to date
      </span>
    );
  }
  if (repo.paperSyncStatus === "needs_sync") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
        Outdated
      </span>
    );
  }
  if (repo.paperSyncStatus === "never_synced") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        Not synced
      </span>
    );
  }
  return null;
});
