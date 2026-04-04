import { describe, expect, it } from "vitest";
import { normalizeRepositorySyncError } from "./syncErrors";

describe("normalizeRepositorySyncError", () => {
  it("normalizes nested Overleaf authentication errors", () => {
    const normalized = normalizeRepositorySyncError(
      new Error(
        "Uncaught Error: Uncaught Error: Failed to get Overleaf commit: " +
        "{\"error\":\"remote: Enter your Git authentication token when prompted for a password.\"}"
      )
    );

    expect(normalized).toEqual({
      message: "Overleaf authentication failed. Update your Overleaf Git token in Settings and retry.",
      isAuthenticationError: true,
      isConfigurationError: false,
    });
  });

  it("normalizes missing Overleaf credentials", () => {
    expect(
      normalizeRepositorySyncError(new Error("Overleaf credentials not configured."))
    ).toEqual({
      message: "Overleaf credentials are not configured. Connect your Overleaf account in Settings and retry.",
      isAuthenticationError: false,
      isConfigurationError: true,
    });
  });

  it("preserves existing GitLab reconnect messaging", () => {
    expect(
      normalizeRepositorySyncError(
        new Error("GitLab token expired. Please disconnect and reconnect your GitLab account in Settings.")
      )
    ).toEqual({
      message: "GitLab token expired. Please disconnect and reconnect your GitLab account in Settings.",
      isAuthenticationError: true,
      isConfigurationError: false,
    });
  });
});
