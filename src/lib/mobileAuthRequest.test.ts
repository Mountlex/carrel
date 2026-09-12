import { describe, expect, it } from "vitest";
import { parseMobileAuthSearch } from "./mobileAuthRequest";

describe("mobile sign-in links", () => {
  const challenge = "A".repeat(43), state = "B".repeat(43);
  it("preserves the proof challenge and state through the OAuth return URL", () => {
    expect(parseMobileAuthSearch({ provider: "github", codeChallenge: challenge, state })).toEqual({
      provider: "github", codeChallenge: challenge, state, error: undefined,
    });
  });
  it.each([
    { codeChallenge: challenge }, { state }, { codeChallenge: "bad", state },
    { codeChallenge: challenge, state: "bad" }, { codeChallenge: [challenge], state },
  ])("rejects an incomplete secure request instead of falling back to legacy credentials: %j", search => {
    expect(() => parseMobileAuthSearch(search)).toThrow("incomplete");
  });
  it("preserves older mobile clients without accepting arbitrary providers", () => {
    expect(parseMobileAuthSearch({ provider: "gitlab" }).provider).toBe("gitlab");
    expect(parseMobileAuthSearch({ provider: "unknown" }).provider).toBeUndefined();
  });
});
