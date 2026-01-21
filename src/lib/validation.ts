// Common weak passwords to reject
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "qwerty", "qwerty123",
  "letmein", "welcome", "admin", "login", "abc123", "123456",
  "12345678", "123456789", "1234567890", "iloveyou", "monkey",
  "dragon", "master", "sunshine", "princess", "football", "baseball",
  "soccer", "hockey", "batman", "superman", "trustno1", "shadow",
]);

/**
 * Validates a password against the security requirements.
 * @param password - The password to validate
 * @param email - Optional email to check password doesn't contain it
 * @returns An error message if validation fails, undefined if valid
 */
export function validatePassword(password: string, email?: string): string | undefined {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 128) {
    return "Password must be 128 characters or less";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return "Password must contain at least one special character";
  }
  // Check against common passwords (case-insensitive, ignoring numbers/special chars)
  const passwordBase = password.toLowerCase().replace(/[^a-z]/g, "");
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || COMMON_PASSWORDS.has(passwordBase)) {
    return "Password is too common. Please choose a more unique password";
  }
  // Check if password contains email username
  if (email) {
    const emailUsername = email.split("@")[0].toLowerCase();
    if (emailUsername.length >= 3 && password.toLowerCase().includes(emailUsername)) {
      return "Password cannot contain your email address";
    }
  }
  return undefined;
}

/**
 * Password requirements as a human-readable string (for placeholders/hints)
 */
export const PASSWORD_REQUIREMENTS = "Min 8 chars, uppercase, lowercase, number, special char";
