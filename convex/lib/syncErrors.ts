export interface NormalizedRepositorySyncError {
  message: string;
  isAuthenticationError: boolean;
  isConfigurationError: boolean;
}

function unwrapErrorPrefix(message: string): string {
  let normalized = message.trim();
  while (normalized.startsWith("Uncaught Error: ")) {
    normalized = normalized.slice("Uncaught Error: ".length).trim();
  }
  return normalized;
}

export function normalizeRepositorySyncError(error: unknown): NormalizedRepositorySyncError {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "Repository sync failed.");
  const message = unwrapErrorPrefix(rawMessage);

  if (
    message.includes("Failed to get Overleaf commit:")
    && message.includes("Enter your Git authentication token")
  ) {
    return {
      message: "Overleaf authentication failed. Update your Overleaf Git token in Settings and retry.",
      isAuthenticationError: true,
      isConfigurationError: false,
    };
  }

  if (
    message.includes("Failed to access Overleaf project:")
    && message.includes("Enter your Git authentication token")
  ) {
    return {
      message: "Overleaf authentication failed. Update your Overleaf Git token in Settings and retry.",
      isAuthenticationError: true,
      isConfigurationError: false,
    };
  }

  if (message.includes("Overleaf credentials not configured.")) {
    return {
      message: "Overleaf credentials are not configured. Connect your Overleaf account in Settings and retry.",
      isAuthenticationError: false,
      isConfigurationError: true,
    };
  }

  if (message.includes("LATEX_SERVICE_URL not configured.")) {
    return {
      message: "Overleaf support is not configured on the server. Set LATEX_SERVICE_URL and retry.",
      isAuthenticationError: false,
      isConfigurationError: true,
    };
  }

  return {
    message,
    isAuthenticationError: message.includes("token expired") || message.includes("authentication failed"),
    isConfigurationError: false,
  };
}
