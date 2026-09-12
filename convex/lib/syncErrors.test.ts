import { describe, expect, it } from "vitest";
import { normalizeRepositorySyncError, summarizeBuildError } from "./syncErrors";

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

describe("summarizeBuildError", () => {
  it("exposes a useful compilation summary without the log or stack", () => {
    expect(summarizeBuildError(new Error("Uncaught Error: Compilation failed\n\nLog:\nprivate source\n at handler")))
      .toBe("Compilation failed. Open the paper's build log for details.");
  });

  it("distinguishes timeouts and repository authentication failures", () => {
    expect(summarizeBuildError(new Error("Job exceeded its total time limit"))).toContain("time limit");
    expect(summarizeBuildError(new Error("Failed to get Overleaf commit: Enter your Git authentication token")))
      .toBe("Overleaf authentication failed. Update your Overleaf Git token and retry.");
  });

  it("does not expose unexpected internal error details", () => {
    expect(summarizeBuildError(new Error("Database failure: secret")))
      .toBe("The paper could not be built. Open the paper's build log for details.");
  });
});
