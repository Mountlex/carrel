export function PaperDetailSkeleton() {
  return (
    <div>
      {/* Back link skeleton */}
      <div className="mb-6">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* PDF Preview skeleton */}
        <div className="lg:col-span-2">
          <div className="h-[calc(100vh-12rem)] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
        </div>

        {/* Paper Details skeleton */}
        <div className="space-y-6">
          <div>
            <div className="h-8 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="rounded-lg border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 h-5 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          {/* Action buttons skeleton */}
          <div className="flex items-center justify-center gap-2">
            <div className="h-10 w-10 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-10 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-10 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-10 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
