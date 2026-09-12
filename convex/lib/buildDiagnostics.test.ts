import { describe, expect, it } from "vitest";
import { buildCompletionMessage, trimCompilationLog } from "./buildDiagnostics";

describe("build diagnostics", () => {
  it("keeps the actual TeX failure after a long package-loading preamble", () => {
    const failure = "! I can't find file 'new-section.tex'.\nFatal error occurred, no output PDF file produced!";
    const trimmed = trimCompilationLog("Package loaded.\n".repeat(10000) + failure);
    expect(trimmed).toHaveLength(20000);
    expect(trimmed.endsWith(failure)).toBe(true);
    expect(trimCompilationLog(failure)).toBe(failure);
  });

  it("keeps iOS notifications below the payload limit with long Unicode titles and logs", () => {
    const message = buildCompletionMessage({ status: "failure", paperId: "p".repeat(32),
      paperTitle: "📝".repeat(10000), error: "Private TeX source".repeat(5000) });
    const payload = JSON.stringify({ aps: { alert: { title: message.title, body: message.body },
      sound: "default", "content-available": 1 }, ...message.data });
    expect(new TextEncoder().encode(payload).length).toBeLessThan(4096);
    expect(payload).not.toContain("Private TeX source");
    expect(message.data.error).toBe("Open the paper to view the build error.");
  });

  it("preserves normal build-success notifications", () => {
    expect(buildCompletionMessage({ status: "success", paperId: "paper", paperTitle: "DRF" }))
      .toMatchObject({ title: "Build completed", body: "DRF is ready.", data: { status: "success", error: undefined } });
  });
});
