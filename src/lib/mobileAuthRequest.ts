export interface MobileAuthSearch {
  provider?: "github" | "gitlab" | "email";
  error?: string;
  codeChallenge?: string;
  state?: string;
}

export function parseMobileAuthSearch(search: Record<string, unknown>): MobileAuthSearch {
  const secureRequest = search.codeChallenge !== undefined || search.state !== undefined;
  const validValue = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
  if (secureRequest && (!validValue(search.codeChallenge) || !validValue(search.state))) {
    throw new Error("This sign-in link is incomplete. Return to Carrel and start sign-in again.");
  }
  return {
    codeChallenge: secureRequest ? search.codeChallenge as string : undefined,
    state: secureRequest ? search.state as string : undefined,
    provider: search.provider === "github" || search.provider === "gitlab" || search.provider === "email" ? search.provider : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  };
}
