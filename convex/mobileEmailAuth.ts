"use node";

/// <reference types="node" />

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import * as crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

// Verify password against stored hash (Lucia's scrypt format)
// Format: hexSalt:hexKey
// Lucia passes the salt string (hex) directly to scrypt, not raw bytes
async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [salt, storedKey] = parts;

  // Normalize password with NFKC (as Lucia does)
  const normalizedPassword = password.normalize("NFKC");

  const N = 16384;
  const r = 16;
  const p = 1;
  const dkLen = 64;
  const maxmem = 64 * 1024 * 1024; // 64MB

  try {
    // Lucia passes the salt STRING (hex) to scrypt, not the raw bytes
    const computedKey = (await scryptAsync(normalizedPassword, salt, dkLen, {
      N,
      r,
      p,
      maxmem,
    })) as Buffer;

    // Constant-time comparison
    const storedKeyBuffer = Buffer.from(storedKey, "hex");
    return crypto.timingSafeEqual(computedKey, storedKeyBuffer);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}

// Internal action to verify email and password
export const verifyEmailPassword = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; userId?: string; error?: string }> => {
    // Find user by email
    const user = await ctx.runQuery(internal.users.getUserByEmail, {
      email: args.email.toLowerCase().trim(),
    });

    if (!user) {
      // Don't reveal whether user exists
      return { success: false, error: "Invalid email or password" };
    }

    // Get the password hash from authAccounts
    const passwordHash = await ctx.runQuery(
      internal.mobileAuth.getPasswordHash,
      {
        userId: user._id,
      }
    );

    if (!passwordHash) {
      // User doesn't have password auth set up
      return { success: false, error: "Invalid email or password" };
    }

    // Verify password
    const isValid = await verifyPassword(args.password, passwordHash);

    if (!isValid) {
      return { success: false, error: "Invalid email or password" };
    }

    return { success: true, userId: user._id };
  },
});
