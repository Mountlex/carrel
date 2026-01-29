export type GitLabAuthKind = "cloud" | "selfhosted" | null;

export function getGitLabAuthKind(error: unknown): { kind: GitLabAuthKind; message: string } {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("personal access token") || normalized.includes("self-hosted")) {
    return { kind: "selfhosted", message };
  }

  if (
    normalized.includes("gitlab authentication failed") ||
    normalized.includes("gitlab token expired") ||
    (normalized.includes("gitlab api error") && (normalized.includes(" 401") || normalized.includes(" 403")))
  ) {
    return { kind: "cloud", message };
  }

  return { kind: null, message };
}
