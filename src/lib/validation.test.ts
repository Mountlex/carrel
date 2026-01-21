import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_REQUIREMENTS } from "./validation";

describe("validatePassword", () => {
  it("returns undefined for valid password", () => {
    expect(validatePassword("Tr0ub4dor&")).toBeUndefined();
    expect(validatePassword("MySecure123@")).toBeUndefined();
    expect(validatePassword("C0mpl3x#Pwd")).toBeUndefined();
  });

  it("returns error for password less than 8 characters", () => {
    expect(validatePassword("Pass1!")).toBe("Password must be at least 8 characters");
    expect(validatePassword("Ab1@")).toBe("Password must be at least 8 characters");
    expect(validatePassword("")).toBe("Password must be at least 8 characters");
  });

  it("returns error for password over 128 characters", () => {
    const longPassword = "A".repeat(129) + "a1!";
    expect(validatePassword(longPassword)).toBe("Password must be 128 characters or less");
  });

  it("returns error for password without uppercase letter", () => {
    expect(validatePassword("password123!")).toBe("Password must contain at least one uppercase letter");
    expect(validatePassword("lowercase1@")).toBe("Password must contain at least one uppercase letter");
  });

  it("returns error for password without lowercase letter", () => {
    expect(validatePassword("PASSWORD123!")).toBe("Password must contain at least one lowercase letter");
    expect(validatePassword("UPPERCASE1@")).toBe("Password must contain at least one lowercase letter");
  });

  it("returns error for password without number", () => {
    expect(validatePassword("PasswordNoNum!")).toBe("Password must contain at least one number");
    expect(validatePassword("Uppercase@abc")).toBe("Password must contain at least one number");
  });

  it("returns error for password without special character", () => {
    expect(validatePassword("Password123")).toBe("Password must contain at least one special character");
    expect(validatePassword("SecurePass9")).toBe("Password must contain at least one special character");
  });

  it("returns error for common passwords", () => {
    expect(validatePassword("Tr0ub4dor&")).toBeUndefined(); // Not in common list
    expect(validatePassword("Qwerty123!")).toBe("Password is too common. Please choose a more unique password");
    expect(validatePassword("Letmein1!")).toBe("Password is too common. Please choose a more unique password");
    expect(validatePassword("Password1!")).toBe("Password is too common. Please choose a more unique password");
  });

  it("returns error if password contains email username", () => {
    expect(validatePassword("Johnsmith1!", "john@example.com")).toBe("Password cannot contain your email address");
    expect(validatePassword("MyJohnPass1!", "john@example.com")).toBe("Password cannot contain your email address");
    // Short usernames (< 3 chars) are not checked
    expect(validatePassword("Abcdefg1!", "ab@example.com")).toBeUndefined();
  });

  it("validates in correct order", () => {
    // Short password - length error first
    expect(validatePassword("abc")).toBe("Password must be at least 8 characters");

    // Long enough but no uppercase - uppercase error
    expect(validatePassword("lowercase123!")).toBe("Password must contain at least one uppercase letter");

    // Has uppercase but no lowercase - lowercase error
    expect(validatePassword("UPPERCASE123!")).toBe("Password must contain at least one lowercase letter");

    // Has both cases but no number - number error
    expect(validatePassword("Uppercase@abc")).toBe("Password must contain at least one number");

    // Has everything but no special char - special char error
    expect(validatePassword("Password123")).toBe("Password must contain at least one special character");
  });
});

describe("PASSWORD_REQUIREMENTS", () => {
  it("contains expected requirement hints", () => {
    expect(PASSWORD_REQUIREMENTS).toContain("8");
    expect(PASSWORD_REQUIREMENTS.toLowerCase()).toContain("uppercase");
    expect(PASSWORD_REQUIREMENTS.toLowerCase()).toContain("lowercase");
    expect(PASSWORD_REQUIREMENTS.toLowerCase()).toContain("number");
    expect(PASSWORD_REQUIREMENTS.toLowerCase()).toContain("special");
  });
});
