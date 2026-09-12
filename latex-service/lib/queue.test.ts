import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { CompilationQueue } = require("./queue.js");
const logger = { info: vi.fn() };
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("job queue", () => {
  it("runs FIFO, removes cancelled waiters and keeps the worker occupied until cleanup finishes", async () => {
    const queue = new CompilationQueue({ maxConcurrent: 1, maxQueued: 3 });
    const active = gate();
    const order: number[] = [];
    const first = queue.run(() => active.promise, { logger });
    const controller = new AbortController();
    const abandoned = vi.fn();
    const cancelled = queue.run(abandoned, { logger, signal: controller.signal });
    const cancelledCheck = expect(cancelled).rejects.toThrow("disconnected");
    const second = queue.run(() => order.push(2), { logger });
    const third = queue.run(() => order.push(3), { logger });
    controller.abort(new Error("disconnected"));
    await cancelledCheck;
    expect(queue.stats()).toMatchObject({ running: 1, queued: 2 });
    expect(order).toEqual([]);
    active.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([2, 3]);
    expect(abandoned).not.toHaveBeenCalled();
    expect(queue.pending()).toBe(0);
  });

  it("expires waiting jobs without running them later", async () => {
    vi.useFakeTimers();
    try {
      const queue = new CompilationQueue();
      const active = gate();
      const first = queue.run(() => active.promise, { logger });
      const staleJob = vi.fn();
      const waiting = queue.run(staleJob, { logger, maxWaitMs: 100 });
      const check = expect(waiting).rejects.toMatchObject({ code: "QUEUE_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(100);
      await check;
      active.resolve();
      await first;
      expect(staleJob).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("rejects queued and new jobs on shutdown while letting active work finish", async () => {
    const queue = new CompilationQueue();
    const active = gate();
    const first = queue.run(() => active.promise, { logger });
    const waiting = queue.run(vi.fn(), { logger });
    const check = expect(waiting).rejects.toMatchObject({ code: "QUEUE_CLEARED" });
    queue.clear();
    await check;
    await expect(queue.run(vi.fn(), { logger })).rejects.toMatchObject({ code: "QUEUE_CLEARED" });
    expect(queue.pending()).toBe(1);
    active.resolve();
    await first;
    expect(queue.pending()).toBe(0);
  });

  it("supports no waiting slots and recovers from a worker failure", async () => {
    const queue = new CompilationQueue({ maxQueued: 0 });
    const active = gate();
    const first = queue.run(() => active.promise, { logger });
    await expect(queue.run(vi.fn(), { logger })).rejects.toMatchObject({ code: "QUEUE_FULL" });
    active.resolve();
    await first;
    await expect(queue.run(() => { throw new Error("failed"); }, { logger })).rejects.toThrow("failed");
    await expect(queue.run(() => 42, { logger })).resolves.toBe(42);
  });
});
