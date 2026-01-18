import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_REQUIREMENTS } from "./validation";

describe("validatePassword", () => {
  it("returns undefined for valid password", () => {
    expect(validatePassword("Password1")).toBeUndefined();
    expect(validatePassword("MySecure123")).toBeUndefined();
    expect(validatePassword("UPPERCASE1lowercase")).toBeUndefined();
  });

  it("returns error for password less than 8 characters", () => {
    expect(validatePassword("Pass1")).toBe("Password must be at least 8 characters");
    expect(validatePassword("Ab1")).toBe("Password must be at least 8 characters");
    expect(validatePassword("")).toBe("Password must be at least 8 characters");
  });

  it("returns error for password without uppercase letter", () => {
    expect(validatePassword("password123")).toBe("Password must contain at least one uppercase letter");
    expect(validatePassword("lowercase1")).toBe("Password must contain at least one uppercase letter");
  });

  it("returns error for password without number", () => {
    expect(validatePassword("PasswordNoNumber")).toBe("Password must contain at least one number");
    expect(validatePassword("Uppercase")).toBe("Password must contain at least one number");
  });

  it("validates in correct order (length first, then uppercase, then number)", () => {
    // Short password without uppercase or number - length error first
    expect(validatePassword("abc")).toBe("Password must be at least 8 characters");

    // Long enough but no uppercase - uppercase error
    expect(validatePassword("lowercase123")).toBe("Password must contain at least one uppercase letter");

    // Long enough with uppercase but no number - number error
    expect(validatePassword("Uppercase")).toBe("Password must contain at least one number");
  });
});

describe("PASSWORD_REQUIREMENTS", () => {
  it("contains expected requirement hints", () => {
    expect(PASSWORD_REQUIREMENTS).toContain("8");
    expect(PASSWORD_REQUIREMENTS.toLowerCase()).toContain("uppercase");
    expect(PASSWORD_REQUIREMENTS.toLowerCase()).toContain("number");
  });
});
