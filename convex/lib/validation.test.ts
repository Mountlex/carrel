import { describe, it, expect } from "vitest";
import { validatePasswordOrThrow } from "./validation";

describe("validatePasswordOrThrow", () => {
  it("does not throw for valid password", () => {
    expect(() => validatePasswordOrThrow("Password1")).not.toThrow();
    expect(() => validatePasswordOrThrow("MySecure123")).not.toThrow();
  });

  it("throws for password less than 8 characters", () => {
    expect(() => validatePasswordOrThrow("Pass1")).toThrow("Password must be at least 8 characters");
    expect(() => validatePasswordOrThrow("")).toThrow("Password must be at least 8 characters");
  });

  it("throws for password without uppercase letter", () => {
    expect(() => validatePasswordOrThrow("password123")).toThrow("Password must contain at least one uppercase letter");
  });

  it("throws for password without number", () => {
    expect(() => validatePasswordOrThrow("PasswordNoNumber")).toThrow("Password must contain at least one number");
  });
});
