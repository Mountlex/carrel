import { describe, it, expect } from "vitest";
import { validatePasswordOrThrow } from "./validation";

describe("validatePasswordOrThrow", () => {
  it("does not throw for valid password", () => {
    expect(() => validatePasswordOrThrow("Tr0ub4dor&")).not.toThrow();
    expect(() => validatePasswordOrThrow("MySecure123@")).not.toThrow();
    expect(() => validatePasswordOrThrow("C0mpl3x#Pwd")).not.toThrow();
  });

  it("throws for password less than 8 characters", () => {
    expect(() => validatePasswordOrThrow("Pass1!")).toThrow("Password must be at least 8 characters");
    expect(() => validatePasswordOrThrow("")).toThrow("Password must be at least 8 characters");
  });

  it("throws for password over 128 characters", () => {
    const longPassword = "A".repeat(129) + "a1!";
    expect(() => validatePasswordOrThrow(longPassword)).toThrow("Password must be 128 characters or less");
  });

  it("throws for password without uppercase letter", () => {
    expect(() => validatePasswordOrThrow("password123!")).toThrow("Password must contain at least one uppercase letter");
  });

  it("throws for password without lowercase letter", () => {
    expect(() => validatePasswordOrThrow("PASSWORD123!")).toThrow("Password must contain at least one lowercase letter");
  });

  it("throws for password without number", () => {
    expect(() => validatePasswordOrThrow("PasswordNoNum!")).toThrow("Password must contain at least one number");
  });

  it("throws for password without special character", () => {
    expect(() => validatePasswordOrThrow("Password123")).toThrow("Password must contain at least one special character");
  });

  it("throws for common passwords", () => {
    expect(() => validatePasswordOrThrow("Qwerty123!")).toThrow("Password is too common");
    expect(() => validatePasswordOrThrow("Letmein1!")).toThrow("Password is too common");
  });

  it("throws if password contains email username", () => {
    expect(() => validatePasswordOrThrow("Johnsmith1!", "john@example.com")).toThrow("Password cannot contain your email address");
  });
});
