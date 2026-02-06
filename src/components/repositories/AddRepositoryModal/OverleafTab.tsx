interface OverleafTabProps {
  hasCredentials: boolean | undefined;
  isAdding: boolean;
  error: string | null;
  urlValue: string;
  onUrlChange: (url: string) => void;
  onAddRepo: (url: string) => void;
  onShowSetup: () => void;
  onClearCredentials: () => void;
}

export function OverleafTab({
  hasCredentials,
  isAdding,
  error,
  urlValue,
  onUrlChange,
  onAddRepo,
  onShowSetup,
  onClearCredentials,
}: OverleafTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-[#47A141]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
          <span className="text-sm font-normal text-gray-700 dark:text-gray-300">Overleaf</span>
        </div>
        {hasCredentials ? (
          <button
            onClick={onClearCredentials}
            className="text-xs text-danger-600 hover:text-danger-700 dark:text-danger-400 dark:hover:text-danger-300"
          >
            Disconnect
          </button>
        ) : null}
      </div>

      {hasCredentials ? (
        <div>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Enter your Overleaf Git URL (find it in your project's Git menu):
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlValue}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://git.overleaf.com/abc123def456..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isAdding && urlValue.trim()) {
                  onAddRepo(urlValue.trim());
                }
              }}
            />
            <button
              onClick={() => onAddRepo(urlValue.trim())}
              disabled={isAdding || !urlValue.trim()}
              className="shrink-0 rounded-md bg-[#47A141] px-4 py-2 text-sm font-normal text-white hover:bg-[#3d8a37] disabled:opacity-50"
            >
              {isAdding ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onShowSetup}
          className="w-full rounded-md border border-[#47A141]/30 bg-[#47A141]/5 px-4 py-2 text-sm font-normal text-[#47A141] hover:bg-[#47A141]/10 dark:border-[#47A141]/40 dark:bg-[#47A141]/10 dark:text-[#57b151] dark:hover:bg-[#47A141]/20"
        >
          Connect Overleaf Account
        </button>
      )}
      {error && (
        <p className="mt-2 text-sm text-danger-600 dark:text-danger-400">{error}</p>
      )}
    </div>
  );
}
