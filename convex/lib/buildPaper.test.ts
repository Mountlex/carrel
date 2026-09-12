import { describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { buildPaper, buildPaperForMobile } from "../sync";

vi.mock("../auth", () => ({ auth: { getUserId: async () => "user" } }));

function fixture(compileError?: Error) {
  const runQuery = vi.fn(async (ref: FunctionReference<"query">, _args: Record<string, unknown>) => {
    void _args;
    switch (getFunctionName(ref)) {
      case "git:getPaper": return { _id: "paper", trackedFileId: "file", repositoryId: "repo" };
      case "git:getRepository": return { _id: "repo", userId: "user", gitUrl: "https://example.com/repo", defaultBranch: "main" };
      case "git:getTrackedFile": return { repositoryId: "repo", pdfSourceType: "compile", filePath: "main.tex" };
      case "users:getUserCacheModeInternal": return "off";
      case "users:getUserCacheAllowedInternal": return true;
      case "sync:validateBuildAttempt": return true;
      default: throw new Error(`Unexpected query ${getFunctionName(ref)}`);
    }
  });
  const runMutation = vi.fn(async (ref: FunctionReference<"mutation">, _args: Record<string, unknown>) => {
    void _args;
    switch (getFunctionName(ref)) {
      case "sync:checkAndRecordRateLimit": return { allowed: true };
      case "sync:tryAcquireBuildLock": return { acquired: true, attemptId: "attempt" };
      case "sync:updatePaperPdfWithBuildLock": return { success: true };
      default: return null;
    }
  });
  const runAction = vi.fn(async (ref: FunctionReference<"action">, _args: Record<string, unknown>) => {
    void _args;
    switch (getFunctionName(ref)) {
      case "git:fetchLatestCommitInternal": return { sha: "commit", date: "2026-09-12T00:00:00Z" };
      case "latex:compileLatexInternal":
        if (compileError) throw compileError;
        return { storageId: "pdf", size: 100, dependencies: [{ path: "main.tex", hash: "hash" }],
          dependencyPaths: ["main.tex", "section.tex"] };
      case "thumbnail:generateThumbnail": return null;
      default: throw new Error(`Unexpected action ${getFunctionName(ref)}`);
    }
  });
  return { runQuery, runMutation, runAction };
}

// Convex attaches _handler at runtime for invocation; its public action type
// deliberately omits that implementation detail.
type TestBuildHandler = (ctx: ReturnType<typeof fixture>, args: {
  paperId: string; userId?: string; force?: boolean;
}) => Promise<{ updated: boolean }>;
const mobileBuild = (buildPaperForMobile as unknown as { _handler: TestBuildHandler })._handler;
const publicBuild = (buildPaper as unknown as { _handler: TestBuildHandler })._handler;

describe("paper build completion", () => {
  it("stores the PDF and complete dependencies after a mobile compilation", async () => {
    const ctx = fixture();
    const result = await mobileBuild(ctx, {
      paperId: "paper", userId: "user", force: true,
    });
    expect(result.updated).toBe(true);
    const update = ctx.runMutation.mock.calls.find(([ref]) => getFunctionName(ref) === "sync:updatePaperPdfWithBuildLock");
    expect(update?.[1]).toMatchObject({ pdfFileId: "pdf", cachedDependencyPaths: ["main.tex", "section.tex"] });
  });

  it("returns a client-visible error while retaining the log and releasing the lock", async () => {
    const ctx = fixture(new Error("Uncaught Error: Compilation failed\n\nLog:\nmissing section.tex"));
    const args = { paperId: "paper", force: true };
    const failure = await publicBuild(ctx, args).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConvexError);
    expect((failure as ConvexError<string>).data).toBe("Compilation failed. Open the paper's build log for details.");
    const calls = ctx.runMutation.mock.calls.map(([ref, ...args]) => [getFunctionName(ref), ...args]);
    expect(calls).toContainEqual(["sync:updatePaperBuildError", expect.objectContaining({ error: expect.stringContaining("missing section.tex") })]);
    expect(calls).toContainEqual(["sync:releaseBuildLock", expect.objectContaining({ status: "error", attemptId: "attempt" })]);
  });
});
