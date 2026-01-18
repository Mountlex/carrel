import { useState, useCallback } from "react";

export type ToastType = "error" | "success" | "info";

export interface ToastState {
  message: string;
  type: ToastType;
}

/**
 * Hook for managing toast notifications with standardized error handling.
 *
 * @example
 * const { toast, showToast, showError, showSuccess, clearToast } = useToast();
 *
 * // Show error from catch block
 * try {
 *   await someAction();
 * } catch (error) {
 *   showError(error);
 * }
 *
 * // Show success message
 * showSuccess("Repository added successfully");
 *
 * // In JSX
 * {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type });
  }, []);

  const showError = useCallback((error: unknown, fallbackMessage = "An error occurred") => {
    const message = error instanceof Error ? error.message : fallbackMessage;
    setToast({ message, type: "error" });
  }, []);

  const showSuccess = useCallback((message: string) => {
    setToast({ message, type: "success" });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    showToast,
    showError,
    showSuccess,
    clearToast,
  };
}

/**
 * Extracts a user-friendly error message from various error types.
 * @param error - The error to extract a message from
 * @param fallback - Fallback message if extraction fails
 * @returns A user-friendly error message
 */
export function getErrorMessage(error: unknown, fallback = "An unexpected error occurred"): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}
