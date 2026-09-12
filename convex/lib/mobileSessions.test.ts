// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { challengeForVerifier, isActiveSession, MOBILE_CODE_LIFETIME_MS, MOBILE_SESSION_LIFETIME_MS, validChallenge } from "./mobileSessionPolicy";

const modules = import.meta.glob("../**/!(*.*.*)*.*s");
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

async function fixture() {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", { name: "Test Reader" }));
  await t.mutation(internal.mobileSessions.issueCode, { userId, codeHash: "code", challenge });
  return { t, userId };
}

async function signedIn() {
  const { t, userId } = await fixture();
  const session = await t.mutation(internal.mobileSessions.redeemCode, {
    codeHash: "code", challenge, refreshTokenHash: "first-token", deviceId: "phone",
  });
  if (!session) throw new Error("Fixture sign-in failed");
  return { t, userId, session };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("mobile authorization", () => {
  it("matches the RFC 7636 S256 test vector and rejects malformed proof keys", () => {
    expect(challengeForVerifier(verifier)).toBe(challenge);
    expect(challengeForVerifier("too-short")).toBeNull();
    expect(challengeForVerifier("x".repeat(129))).toBeNull();
    expect(validChallenge(challenge)).toBe(true);
    expect(validChallenge(`${challenge}=`)).toBe(false);
  });

  it("requires the matching proof key and consumes a code once", async () => {
    const { t } = await fixture();
    const args = { codeHash: "code", challenge, refreshTokenHash: "token", deviceId: "phone" };
    expect(await t.mutation(internal.mobileSessions.redeemCode, { ...args, challenge: "wrong" })).toBeNull();
    expect(await t.mutation(internal.mobileSessions.redeemCode, args)).not.toBeNull();
    expect(await t.mutation(internal.mobileSessions.redeemCode, args)).toBeNull();
  });

  it("rejects expired codes without issuing a session", async () => {
    const { t } = await fixture();
    vi.setSystemTime(Date.now() + MOBILE_CODE_LIFETIME_MS + 1);
    expect(await t.mutation(internal.mobileSessions.redeemCode, {
      codeHash: "code", challenge, refreshTokenHash: "token", deviceId: "phone",
    })).toBeNull();
    expect(await t.run(ctx => ctx.db.query("mobileSessions").collect())).toHaveLength(0);
  });

  it("caps pending codes per account", async () => {
    const { t, userId } = await fixture();
    for (let index = 1; index < 5; index++) {
      await t.mutation(internal.mobileSessions.issueCode, { userId, codeHash: `code-${index}`, challenge });
    }
    await expect(t.mutation(internal.mobileSessions.issueCode, { userId, codeHash: "overflow", challenge })).rejects.toThrow("Too many");
  });
});

describe("mobile session lifetime", () => {
  it("rotates a refresh token, revokes on replay, and rejects the rotated token afterward", async () => {
    const { t, session } = await signedIn();
    expect(await t.mutation(internal.mobileSessions.rotate, { tokenHash: "first-token", nextTokenHash: "second-token" })).not.toBeNull();
    expect(await t.mutation(internal.mobileSessions.rotate, { tokenHash: "first-token", nextTokenHash: "stolen-token" })).toBeNull();
    expect(await t.query(internal.mobileSessions.sessionUser, { sessionId: session.sessionId })).toBeNull();
    expect(await t.mutation(internal.mobileSessions.rotate, { tokenHash: "second-token", nextTokenHash: "third-token" })).toBeNull();
  });

  it("enforces revocation on ordinary authenticated queries", async () => {
    const { t, userId, session } = await signedIn();
    const reader = t.withIdentity({ subject: `${userId}|mobile:${session.sessionId}` });
    expect(await reader.query(api.users.viewer, {})).toMatchObject({ _id: userId });
    await t.mutation(internal.mobileSessions.revoke, { tokenHash: "first-token" });
    expect(await reader.query(api.users.viewer, {})).toBeNull();
  });

  it("rejects a subject naming the wrong user", async () => {
    const { t, session } = await signedIn();
    const anotherId = await t.run(ctx => ctx.db.insert("users", { name: "Another reader" }));
    expect(await t.withIdentity({ subject: `${anotherId}|mobile:${session.sessionId}` }).query(api.users.viewer, {})).toBeNull();
  });

  it("does not allow session tokens to mint legacy long-lived credentials", async () => {
    const { t, userId, session } = await signedIn();
    await expect(t.withIdentity({ subject: `${userId}|mobile:${session.sessionId}` })
      .mutation(api.mobileAuth.generateMobileTokens, {})).rejects.toThrow("Use the mobile session refresh endpoint");
  });

  it("unregisters push delivery for the signed-out device", async () => {
    const { t, userId } = await signedIn();
    await t.run(ctx => ctx.db.insert("deviceTokens", { userId, token: "apns", platform: "ios", deviceId: "phone", createdAt: Date.now(), lastSeenAt: Date.now() }));
    await t.mutation(internal.mobileSessions.revoke, { tokenHash: "first-token" });
    expect(await t.run(ctx => ctx.db.query("deviceTokens").collect())).toHaveLength(0);
  });

  it("a delayed old sign-out cannot unregister a new sign-in", async () => {
    const { t, userId } = await signedIn();
    await t.run(ctx => ctx.db.insert("deviceTokens", { userId, token: "apns", platform: "ios", deviceId: "phone", createdAt: Date.now(), lastSeenAt: Date.now() }));
    await t.mutation(internal.mobileSessions.issueCode, { userId, codeHash: "new-code", challenge });
    const newer = await t.mutation(internal.mobileSessions.redeemCode, { codeHash: "new-code", challenge, refreshTokenHash: "new-token", deviceId: "phone" });
    await t.mutation(internal.mobileSessions.revoke, { tokenHash: "first-token" });
    expect(await t.run(ctx => ctx.db.query("deviceTokens").collect())).toHaveLength(1);
    expect(await t.query(internal.mobileSessions.sessionUser, { sessionId: newer!.sessionId })).toBe(userId);
  });

  it("account deletion revokes every new mobile session and removes its user", async () => {
    const { t, userId, session } = await signedIn();
    const reader = t.withIdentity({ subject: `${userId}|mobile:${session.sessionId}` });
    expect(await reader.mutation(api.users.deleteAccount, {})).toMatchObject({ deleted: true });
    expect(await t.run(ctx => ctx.db.get(userId))).toBeNull();
    expect(await reader.query(api.users.viewer, {})).toBeNull();
    expect(await t.mutation(internal.mobileSessions.rotate, { tokenHash: "first-token", nextTokenHash: "next" })).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(ctx => ctx.db.query("mobileSessionRefreshTokens").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("mobileSessions").collect())).toHaveLength(0);
  });

  it("expires sessions even before scheduled cleanup runs", async () => {
    const { t, session } = await signedIn();
    vi.setSystemTime(Date.now() + MOBILE_SESSION_LIFETIME_MS + 1);
    expect(await t.query(internal.mobileSessions.sessionUser, { sessionId: session.sessionId })).toBeNull();
    expect(await t.mutation(internal.mobileSessions.rotate, { tokenHash: "first-token", nextTokenHash: "next" })).toBeNull();
    expect(isActiveSession({ expiresAt: Date.now() })).toBe(false);
  });
});

describe("mobile HTTP handshake", () => {
  it("exchanges a proof-bound code, returns short-lived tokens, rotates and revokes the session", async () => {
    const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const encoded = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key.privateKey));
    vi.stubEnv("JWT_PRIVATE_KEY", `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...encoded))}\n-----END PRIVATE KEY-----`);
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    vi.stubEnv("SITE_URL", "https://example.com");
    try {
      const { t, userId } = await fixture();
      const web = t.withIdentity({ subject: `${userId}|web-session` });
      const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.com" }, body: JSON.stringify(body) });
      expect((await t.fetch("/api/mobile/code", post({ codeChallenge: challenge }))).status).toBe(401);
      const authorization = await web.fetch("/api/mobile/code", post({ codeChallenge: challenge }));
      expect(authorization.status).toBe(200);
      expect(authorization.headers.get("Cache-Control")).toBe("no-store");
      expect(authorization.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
      const body = await authorization.json();
      expect(Object.keys(body)).toEqual(["code"]);
      const redeem = { code: body.code, codeVerifier: verifier, deviceId: "http-phone" };
      const exchange = await t.fetch("/api/mobile/token", post(redeem));
      expect(exchange.status).toBe(200);
      const credentials = await exchange.json();
      expect(credentials.refreshToken).toMatch(/^v2\.[a-f0-9]{64}$/);
      const parts = credentials.accessToken.split(".");
      const claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      expect(claims.exp - claims.iat).toBe(15 * 60);
      expect(claims.sub).toMatch(/\|mobile:/);
      const signature = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
      expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key.publicKey, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))).toBe(true);
      expect((await t.fetch("/api/mobile/token", post(redeem))).status).toBe(401);
      const reader = t.withIdentity({ subject: claims.sub });
      expect((await reader.fetch("/api/mobile/exchange", post({}))).status).toBe(403);
      const refresh = await t.fetch("/api/mobile/refresh", post({ refreshToken: credentials.refreshToken }));
      expect(refresh.status).toBe(200);
      const rotated = await refresh.json();
      expect(rotated.refreshToken).not.toBe(credentials.refreshToken);
      expect((await t.fetch("/api/mobile/revoke", post({ refreshToken: rotated.refreshToken }))).status).toBe(200);
      expect(await reader.query(api.users.viewer, {})).toBeNull();
    } finally { vi.unstubAllEnvs(); }
  });
});
