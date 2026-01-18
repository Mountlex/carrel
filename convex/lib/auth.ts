import { auth } from "../auth";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type AuthContext = QueryCtx | MutationCtx | ActionCtx;

/**
 * Requires an authenticated user, throwing an error if not authenticated.
 * @param ctx - The Convex context (query, mutation, or action)
 * @returns The authenticated user's ID
 * @throws Error if not authenticated
 */
export async function requireUserId(ctx: AuthContext): Promise<Id<"users">> {
  const userId = await auth.getUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * Verifies that the authenticated user owns the specified resource.
 * @param authenticatedUserId - The authenticated user's ID
 * @param resourceUserId - The user ID that owns the resource
 * @param resourceName - Name of the resource for error message (optional)
 * @throws Error if the user doesn't own the resource
 */
export function requireOwnership(
  authenticatedUserId: Id<"users">,
  resourceUserId: Id<"users">,
  resourceName = "resource"
): void {
  if (authenticatedUserId !== resourceUserId) {
    throw new Error(`Not authorized to access this ${resourceName}`);
  }
}
