import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { CompilationQueue } = require("./queue.js");
const { runRequestJob, activeJobCount, abortActiveJobs } = require("./requestJob.js");
const { getJobSignal } = require("./jobContext.js");
const { createShutdownHandler } = require("./shutdown.js");
const logger = { info: vi.fn(), error: vi.fn() };
const options = { timeoutMs: 1000, maxWaitMs: 100 };
class Response extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  statusCode = 200;
  body: unknown;
  headers: Record<string, string> = {};
  setHeader(key: string, value: string) { this.headers[key] = value; }
  status(code: number) { this.statusCode = code; return this; }
  json(body: unknown) { this.body = body; this.writableEnded = true; this.emit("close"); return this; }
}
const req = () => ({ log: logger });
const abortable = () => new Promise((_resolve, reject) => {
  const signal = getJobSignal();
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});

describe("HTTP job lifecycle", () => {
  it("returns a structured deadline error and releases the worker", async () => {
    vi.useFakeTimers();
    try {
      const queue = new CompilationQueue();
      const res = new Response();
      const job = runRequestJob(req(), res, queue, abortable, options);
      await vi.advanceTimersByTimeAsync(1000);
      await job;
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ timedOut: true });
      expect(queue.pending()).toBe(0);
      expect(activeJobCount()).toBe(0);
      expect(res.listenerCount("close")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("removes a disconnected waiter and does not cancel a successful response", async () => {
    const queue = new CompilationQueue();
    const activeRes = new Response();
    let finish!: () => void;
    let activeSignal!: AbortSignal;
    const active = runRequestJob(req(), activeRes, queue, async () => {
      activeSignal = getJobSignal();
      await new Promise<void>((resolve) => { finish = resolve; });
      activeRes.json({ ok: true });
    }, options);
    const waitingRes = new Response();
    const handler = vi.fn();
    const waiting = runRequestJob(req(), waitingRes, queue, handler, options);
    waitingRes.destroyed = true;
    waitingRes.emit("close");
    await waiting;
    expect(handler).not.toHaveBeenCalled();
    expect(queue.stats().queued).toBe(0);
    finish();
    await active;
    expect(activeSignal.aborted).toBe(false);
  });

  it("returns Retry-After for busy and shutdown responses", async () => {
    const queue = new CompilationQueue({ maxQueued: 0 });
    const activeRes = new Response();
    const active = runRequestJob(req(), activeRes, queue, abortable, options);
    const busyRes = new Response();
    await runRequestJob(req(), busyRes, queue, vi.fn(), options);
    expect(busyRes.statusCode).toBe(503);
    expect(busyRes.headers["Retry-After"]).toBe("30");
    abortActiveJobs();
    await active;
    expect(activeRes.statusCode).toBe(503);
    expect(activeRes.headers["Retry-After"]).toBe("30");
    expect(activeJobCount()).toBe(0);
  });

  it("keeps cancellation isolated between concurrent jobs", async () => {
    const queue = new CompilationQueue({ maxConcurrent: 2 });
    const firstRes = new Response();
    const secondRes = new Response();
    let secondSignal!: AbortSignal;
    let finish!: () => void;
    const first = runRequestJob(req(), firstRes, queue, abortable, options);
    const second = runRequestJob(req(), secondRes, queue, async () => {
      secondSignal = getJobSignal();
      await new Promise<void>((resolve) => { finish = resolve; });
      secondRes.json({ ok: true });
    }, options);
    firstRes.destroyed = true;
    firstRes.emit("close");
    await first;
    expect(secondSignal.aborted).toBe(false);
    finish();
    await second;
  });
});

describe("shutdown", () => {
  it("cancels at the drain deadline and waits for disconnected job cleanup", async () => {
    vi.useFakeTimers();
    try {
      let jobs = 1;
      const events: string[] = [];
      const shutdown = createShutdownHandler({
        server: { close: (done: () => void) => done() },
        queues: [{ clear: () => events.push("clear") }],
        abortJobs: () => {
          events.push("abort");
          setTimeout(() => { jobs = 0; events.push("job exited"); }, 50);
        },
        activeJobCount: () => jobs,
        cleanup: async () => { events.push("cleanup"); },
        logger, exit: (code: number) => events.push(`exit ${code}`),
        drainMs: 100, forceMs: 500,
      });
      const done = shutdown("SIGTERM");
      await shutdown("SIGTERM");
      await vi.advanceTimersByTimeAsync(99);
      expect(events).toEqual(["clear"]);
      await vi.advanceTimersByTimeAsync(101);
      await done;
      expect(events).toEqual(["clear", "abort", "job exited", "cleanup", "exit 0"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
