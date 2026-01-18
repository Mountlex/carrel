/**
 * Validates a password against the security requirements.
 * Throws an error if validation fails.
 * @param password - The password to validate
 * @throws Error if password doesn't meet requirements
 */
export function validatePasswordOrThrow(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("Password must contain at least one number");
  }
}
