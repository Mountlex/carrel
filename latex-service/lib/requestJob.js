const { jobContext, jobError } = require("./jobContext");

const activeJobs = new Set();
const COMPILE_REQUEST_TIMEOUT_MS = 9 * 60 * 1000;
// Convex waits 30s; reserve time for terminating subprocesses and sending errors.
const THUMBNAIL_REQUEST_TIMEOUT_MS = 24000;

async function runRequestJob(req, res, queue, fn, { timeoutMs, maxWaitMs }) {
  const controller = new AbortController();
  const { signal } = controller;
  const startedAt = Date.now();
  let outcome = "completed";
  const onClose = () => {
    if (!res.writableEnded) controller.abort(jobError("CLIENT_DISCONNECTED", "Client disconnected"));
  };
  res.on("close", onClose);
  activeJobs.add(controller);
  const timer = setTimeout(() => controller.abort(jobError("JOB_TIMEOUT", "Job exceeded its total time limit")), timeoutMs);
  try {
    if (res.destroyed) onClose();
    return await queue.run(() => jobContext.run({ signal }, async () => {
      signal.throwIfAborted();
      const result = await fn();
      signal.throwIfAborted();
      return result;
    }), { signal, maxWaitMs, logger: req.log });
  } catch (error) {
    outcome = signal.aborted ? signal.reason.code : error.code || "error";
    if (res.destroyed || res.writableEnded) return;
    const effectiveError = signal.aborted ? signal.reason : error;
    if (["QUEUE_FULL", "QUEUE_TIMEOUT", "QUEUE_CLEARED", "JOB_SHUTDOWN"].includes(effectiveError.code)) {
      res.setHeader("Retry-After", "30");
      return res.status(503).json({ error: effectiveError.message, retryAfter: 30 });
    }
    if (effectiveError.code === "JOB_TIMEOUT") {
      // Match the existing compilation-timeout response. Convex retries 5xx;
      // repeating an exhausted job could exceed its action execution limit.
      return res.status(400).json({ error: effectiveError.message, timedOut: true });
    }
    throw effectiveError;
  } finally {
    clearTimeout(timer);
    res.removeListener("close", onClose);
    activeJobs.delete(controller);
    req.log.info({ durationMs: Date.now() - startedAt, outcome, statusCode: res.statusCode,
      nodeRssBytes: process.memoryUsage().rss }, "Job finished");
  }
}

function abortActiveJobs() {
  for (const controller of activeJobs) {
    controller.abort(jobError("JOB_SHUTDOWN", "Server is shutting down; please retry"));
  }
}

module.exports = { runRequestJob, abortActiveJobs, activeJobCount: () => activeJobs.size,
  COMPILE_REQUEST_TIMEOUT_MS, THUMBNAIL_REQUEST_TIMEOUT_MS };
