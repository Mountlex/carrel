import { LoadingSpinner } from "./LoadingSpinner";

interface BuildProgressProps {
  status: "idle" | "building" | "error" | undefined;
  progress: string | undefined;
  isCompile: boolean;
}

export function BuildProgress({ status, progress, isCompile }: BuildProgressProps) {
  if (status !== "building") {
    return null;
  }

  return (
    <div className="rounded-md bg-info-50 px-3 py-2 text-sm text-info-700 dark:bg-info-900/30 dark:text-info-300">
      <div className="flex items-center gap-2">
        <LoadingSpinner size="sm" />
        <span className="font-normal">
          {isCompile ? "Compiling LaTeX..." : "Fetching PDF..."}
        </span>
      </div>
      {progress && (
        <p className="mt-1 text-xs opacity-80">{progress}</p>
      )}
    </div>
  );
}
