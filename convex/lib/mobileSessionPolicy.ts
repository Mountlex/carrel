import { sha256 } from "@noble/hashes/sha2.js";

export const MOBILE_ACCESS_LIFETIME_MS = 15 * 60 * 1000;
export const MOBILE_SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const MOBILE_CODE_LIFETIME_MS = 2 * 60 * 1000;

export function validChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function challengeForVerifier(verifier: unknown): string | null {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return null;
  const hash = sha256(new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isActiveSession(session: { expiresAt: number; revokedAt?: number } | null, now = Date.now()): boolean {
  return session !== null && session.revokedAt === undefined && session.expiresAt > now;
}
