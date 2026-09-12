import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isActiveSession, MOBILE_CODE_LIFETIME_MS, MOBILE_SESSION_LIFETIME_MS, validChallenge } from "./lib/mobileSessionPolicy";

async function revokeSession(ctx: MutationCtx, session: Doc<"mobileSessions">) {
  await ctx.db.patch(session._id, { revokedAt: Date.now() });
  const sessions = await ctx.db.query("mobileSessions").withIndex("by_user", q => q.eq("userId", session.userId)).collect();
  // A delayed sign-out request must not unregister a newer sign-in on the same device.
  if (sessions.some(other => other._id !== session._id && other.deviceId === session.deviceId && isActiveSession(other))) return;
  const devices = await ctx.db.query("deviceTokens").withIndex("by_user", q => q.eq("userId", session.userId)).collect();
  for (const device of devices) {
    if (device.deviceId === session.deviceId) await ctx.db.delete(device._id);
  }
}

export const issueCode = internalMutation({
  args: { userId: v.id("users"), codeHash: v.string(), challenge: v.string() },
  handler: async (ctx, args) => {
    if (!validChallenge(args.challenge)) throw new Error("Invalid code challenge");
    const pending = await ctx.db.query("mobileAuthorizationCodes").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    for (const code of pending.filter(code => code.expiresAt <= Date.now())) await ctx.db.delete(code._id);
    if (pending.filter(code => code.expiresAt > Date.now()).length >= 5) throw new Error("Too many sign-in attempts");
    const id = await ctx.db.insert("mobileAuthorizationCodes", { ...args, expiresAt: Date.now() + MOBILE_CODE_LIFETIME_MS });
    await ctx.scheduler.runAfter(MOBILE_CODE_LIFETIME_MS, internal.mobileSessions.expireCode, { id });
  },
});

export const expireCode = internalMutation({
  args: { id: v.id("mobileAuthorizationCodes") },
  handler: async (ctx, { id }) => { if (await ctx.db.get(id)) await ctx.db.delete(id); },
});

// Redemption and consumption share a transaction, so simultaneous requests cannot reuse a code.
export const redeemCode = internalMutation({
  args: { codeHash: v.string(), challenge: v.string(), refreshTokenHash: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const code = await ctx.db.query("mobileAuthorizationCodes").withIndex("by_code_hash", q => q.eq("codeHash", args.codeHash)).unique();
    if (!code || code.expiresAt <= Date.now() || code.challenge !== args.challenge || !await ctx.db.get(code.userId)) return null;
    await ctx.db.delete(code._id);
    const expiresAt = Date.now() + MOBILE_SESSION_LIFETIME_MS;
    const previous = await ctx.db.query("mobileSessions").withIndex("by_user", q => q.eq("userId", code.userId)).collect();
    for (const session of previous) {
      if (session.deviceId === args.deviceId && session.revokedAt === undefined) await ctx.db.patch(session._id, { revokedAt: Date.now() });
    }
    const sessionId = await ctx.db.insert("mobileSessions", { userId: code.userId, deviceId: args.deviceId, expiresAt });
    await ctx.db.insert("mobileSessionRefreshTokens", { sessionId, tokenHash: args.refreshTokenHash });
    await ctx.scheduler.runAfter(MOBILE_SESSION_LIFETIME_MS, internal.mobileSessions.expireSession, { sessionId });
    return { sessionId, userId: code.userId, expiresAt };
  },
});

export const rotate = internalMutation({
  args: { tokenHash: v.string(), nextTokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db.query("mobileSessionRefreshTokens").withIndex("by_token_hash", q => q.eq("tokenHash", args.tokenHash)).unique();
    if (!token) return null;
    const session = await ctx.db.get(token.sessionId);
    if (!session || !isActiveSession(session) || !await ctx.db.get(session.userId)) return null;
    if (token.consumedAt !== undefined) {
      await revokeSession(ctx, session);
      return null;
    }
    await ctx.db.patch(token._id, { consumedAt: Date.now() });
    await ctx.db.insert("mobileSessionRefreshTokens", { sessionId: session._id, tokenHash: args.nextTokenHash });
    return { sessionId: session._id, userId: session.userId, expiresAt: session.expiresAt };
  },
});

export const revoke = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db.query("mobileSessionRefreshTokens").withIndex("by_token_hash", q => q.eq("tokenHash", args.tokenHash)).unique();
    const session = token ? await ctx.db.get(token.sessionId) : null;
    if (session) await revokeSession(ctx, session);
  },
});

export const sessionUser = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const id = ctx.db.normalizeId("mobileSessions", sessionId);
    const session = id ? await ctx.db.get(id) : null;
    return session && isActiveSession(session) ? session.userId : null;
  },
});

export const expireSession = internalMutation({
  args: { sessionId: v.id("mobileSessions") },
  handler: async (ctx, { sessionId }) => {
    const tokens = await ctx.db.query("mobileSessionRefreshTokens").withIndex("by_session", q => q.eq("sessionId", sessionId)).take(200);
    for (const token of tokens) await ctx.db.delete(token._id);
    if (tokens.length === 200) {
      await ctx.scheduler.runAfter(0, internal.mobileSessions.expireSession, { sessionId });
    } else if (await ctx.db.get(sessionId)) await ctx.db.delete(sessionId);
  },
});
