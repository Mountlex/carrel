import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

interface PdfViewerProps {
  url: string;
  title?: string;
  hideFullscreenButton?: boolean;
}

export interface PdfViewerRef {
  toggleFullscreen: () => Promise<void>;
}

export const PdfViewer = forwardRef<PdfViewerRef, PdfViewerProps>(
  function PdfViewer({ url, title, hideFullscreenButton = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = useCallback(async () => {
      if (!containerRef.current) return;

      try {
        if (!document.fullscreenElement) {
          if (!document.fullscreenEnabled) return;
          await containerRef.current.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error) {
        console.warn("Fullscreen toggle failed:", error);
      }
    }, []);

    // Expose toggleFullscreen to parent via ref
    useImperativeHandle(ref, () => ({
      toggleFullscreen,
    }), [toggleFullscreen]);

    // Listen for fullscreen changes (e.g., user presses Escape)
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    // Keyboard shortcut: F key for fullscreen (disabled when button is hidden)
    useEffect(() => {
      if (hideFullscreenButton) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "f" && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const target = e.target as HTMLElement;
          // Don't trigger if typing in an input
          if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
          void toggleFullscreen();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleFullscreen, hideFullscreenButton]);

    return (
      <div ref={containerRef} className="relative h-full w-full bg-gray-900">
        <iframe
          src={url}
          className="h-full w-full"
          title={title || "PDF viewer"}
          sandbox="allow-same-origin allow-scripts"
        />

        {/* Fullscreen toggle button */}
        {!hideFullscreenButton && (
          <button
            onClick={toggleFullscreen}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-lg transition-all hover:scale-110 hover:bg-white focus:outline-none focus:ring-2 focus:ring-white opacity-0 [div:hover>&]:opacity-100 focus:opacity-100"
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        )}
      </div>
    );
  }
);
