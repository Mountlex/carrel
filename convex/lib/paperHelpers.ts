import type { Doc, Id } from "../_generated/dataModel";

type Paper = Doc<"papers">;
type Repository = Doc<"repositories"> | null;

/**
 * Determines if a paper is up-to-date with its repository.
 *
 * @returns
 *   - `null` if paper has no repository (uploaded PDF)
 *   - `true` if paper is up-to-date
 *   - `false` if paper needs sync
 */
export function determineIfUpToDate(
  paper: Paper,
  repository: Repository
): boolean | null {
  // No repository means it's an uploaded PDF - no sync concept
  if (!paper.repositoryId || !repository) {
    return null;
  }

  // Paper has repo but hasn't been synced yet (no PDF)
  if (!paper.pdfFileId) {
    return false;
  }

  // Paper has been explicitly marked as needing sync (dependencies changed)
  if (paper.needsSync === true) {
    return false;
  }

  // Paper has been explicitly marked as up-to-date
  if (paper.needsSync === false) {
    return true;
  }

  // Fallback to commit hash comparison (for papers without needsSync set)
  if (repository.lastCommitHash) {
    return paper.cachedCommitHash === repository.lastCommitHash;
  }

  // Repository hasn't been synced yet
  return false;
}

interface OwnershipCheckResult {
  hasAccess: boolean;
}

/**
 * Checks if a user has ownership of a paper.
 * A paper can be owned either:
 * - Directly via userId field
 * - Indirectly via repository ownership
 *
 * @param paper The paper to check ownership for
 * @param authenticatedUserId The user ID to check against
 * @param repository The paper's repository (if any) - must be pre-fetched
 * @returns Object indicating if user has access
 */
export function checkPaperOwnership(
  paper: Paper,
  authenticatedUserId: Id<"users">,
  repository: Repository
): OwnershipCheckResult {
  let hasValidOwnership = false;

  // Check direct ownership via userId
  if (paper.userId) {
    if (paper.userId !== authenticatedUserId) {
      return { hasAccess: false };
    }
    hasValidOwnership = true;
  }

  // Check ownership via repository
  if (paper.repositoryId) {
    if (!repository || repository.userId !== authenticatedUserId) {
      return { hasAccess: false };
    }
    hasValidOwnership = true;
  }

  // If neither userId nor repositoryId is set, deny access (orphaned paper)
  return { hasAccess: hasValidOwnership };
}
