interface PaperActionBarProps {
  title: string;
  pdfUrl: string | null;
  isPublic: boolean;
  onTogglePublic: () => void;
  onDelete: () => void;
  onToggleFullscreen: () => void;
}

export function PaperActionBar({
  title,
  pdfUrl,
  isPublic,
  onTogglePublic,
  onDelete,
  onToggleFullscreen,
}: PaperActionBarProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {pdfUrl && (
        <a
          href={pdfUrl}
          download
          className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title="Download PDF"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      )}
      {pdfUrl && (
        <button
          onClick={onToggleFullscreen}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title="View Full Screen (F)"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}
      <button
        onClick={onTogglePublic}
        className={`flex h-10 w-10 items-center justify-center rounded-md border focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isPublic
            ? "border-success-300 text-success-700 hover:bg-success-50 focus:ring-success-500 dark:border-success-700 dark:text-success-400 dark:hover:bg-success-900/30"
            : "border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        }`}
        title={isPublic ? "Make Private" : "Make Public"}
        aria-label={`${isPublic ? "Make" : "Make"} ${title} ${isPublic ? "private" : "public"}`}
      >
        {isPublic ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        )}
      </button>
      <button
        onClick={onDelete}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-danger-300 text-danger-700 hover:bg-danger-50 focus:outline-none focus:ring-2 focus:ring-danger-500 focus:ring-offset-2 dark:border-danger-700 dark:text-danger-400 dark:hover:bg-danger-900/30"
        title={`Delete ${title}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
