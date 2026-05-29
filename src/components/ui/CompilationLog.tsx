import { useState } from "react";

interface CompilationLogProps {
  error: string;
}

export function CompilationLog({ error }: CompilationLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [didCopy, setDidCopy] = useState(false);

  // Parse the error to separate the message from the log
  const logSeparator = "\n\nLog:\n";
  const separatorIndex = error.indexOf(logSeparator);

  const hasLog = separatorIndex !== -1;
  const errorMessage = hasLog ? error.slice(0, separatorIndex) : error;
  const logContent = hasLog ? error.slice(separatorIndex + logSeparator.length) : null;
  const canCopy = typeof navigator !== "undefined" && Boolean(navigator.clipboard);

  const handleCopy = async () => {
    if (!canCopy) return;
    await navigator.clipboard.writeText(error);
    setDidCopy(true);
    window.setTimeout(() => setDidCopy(false), 1500);
  };

  return (
    <div className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:bg-danger-900/30 dark:text-danger-300">
      <div className="flex items-start justify-between gap-3">
        <p className="max-h-48 flex-1 overflow-auto whitespace-pre-wrap break-words font-normal">
          {errorMessage}
        </p>
        {canCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 text-xs text-danger-600 underline hover:text-danger-800 hover:no-underline dark:text-danger-400 dark:hover:text-danger-200"
          >
            {didCopy ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {logContent && (
        <div className="mt-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs font-normal text-danger-600 hover:text-danger-800 dark:text-danger-400 dark:hover:text-danger-200"
          >
            <svg
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isExpanded ? "Hide compilation log" : "Show compilation log"}
          </button>

          {isExpanded && (
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 text-xs text-gray-100 dark:bg-gray-950">
              {logContent}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
