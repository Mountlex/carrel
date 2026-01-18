/**
 * Validates a password against the security requirements.
 * @param password - The password to validate
 * @returns An error message if validation fails, undefined if valid
 */
export function validatePassword(password: string): string | undefined {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return undefined;
}

/**
 * Password requirements as a human-readable string (for placeholders/hints)
 */
export const PASSWORD_REQUIREMENTS = "Min 8 chars, 1 uppercase, 1 number";
