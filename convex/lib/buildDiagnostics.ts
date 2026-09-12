/** Keep the end of TeX logs, where fatal errors and missing inputs are reported. */
export function trimCompilationLog(log: string): string {
  const limit = 20000;
  const marker = "...(earlier log omitted)\n";
  return log.length <= limit ? log : marker + log.slice(-(limit - marker.length));
}

/** Keep notification data small even when the paper contains a full TeX log. */
export function buildCompletionMessage(args: {
  status: "success" | "failure";
  paperId: string;
  paperTitle: string;
  error?: string;
}) {
  const title = args.status === "success" ? "Build completed" : "Build failed";
  const characters = Array.from(args.paperTitle || "Paper");
  const paperTitle = characters.length > 160 ? characters.slice(0, 160).join("") + "…" : characters.join("");
  return {
    title,
    body: args.status === "success" ? `${paperTitle} is ready.` : `${paperTitle} failed to build.`,
    data: {
      event: "build_completed",
      status: args.status,
      paperId: args.paperId,
      error: args.error ? "Open the paper to view the build error." : undefined,
    },
  };
}
