const { jobError } = require("./jobContext");

class CompilationQueue {
  constructor({ maxConcurrent = 1, maxQueued = 10 } = {}) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 ||
        !Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new Error("Invalid queue limits");
    }
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
    this.running = 0;
    this.queue = [];
    this.closed = false;
  }

  stats() {
    return { running: this.running, queued: this.queue.length,
      maxConcurrent: this.maxConcurrent, maxQueued: this.maxQueued };
  }

  async run(fn, { signal, maxWaitMs = 60000, logger = console } = {}) {
    signal?.throwIfAborted();
    if (this.closed) throw jobError("QUEUE_CLEARED", "Server is shutting down");
    if (this.running < this.maxConcurrent) return this._execute(fn, logger, 0);
    if (this.queue.length >= this.maxQueued) {
      throw Object.assign(jobError("QUEUE_FULL", "Server is busy"), { stats: this.stats() });
    }

    return new Promise((resolve, reject) => {
      const queuedAt = Date.now();
      const entry = { fn, resolve, reject, logger, queuedAt, signal };
      const remove = (error) => {
        const index = this.queue.indexOf(entry);
        if (index < 0) return;
        this.queue.splice(index, 1);
        entry.dispose();
        reject(error);
      };
      const onAbort = () => remove(signal.reason);
      const timer = setTimeout(() => remove(jobError("QUEUE_TIMEOUT", "Server is busy; queue wait limit reached")), maxWaitMs);
      entry.dispose = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      this.queue.push(entry);
      signal?.addEventListener("abort", onAbort, { once: true });
      logger.info?.({ queued: this.queue.length }, "Job queued");
    });
  }

  async _execute(fn, logger, queueWaitMs) {
    this.running++;
    logger.info?.({ queueWaitMs, running: this.running }, "Job started");
    try {
      return await fn();
    } finally {
      this.running--;
      this._processNext();
    }
  }

  _processNext() {
    while (this.queue.length && this.running < this.maxConcurrent) {
      const entry = this.queue.shift();
      entry.dispose();
      if (entry.signal?.aborted) {
        entry.reject(entry.signal.reason);
        continue;
      }
      this._execute(entry.fn, entry.logger, Date.now() - entry.queuedAt)
        .then(entry.resolve, entry.reject);
    }
  }

  pending() { return this.running + this.queue.length; }

  clear() {
    this.closed = true;
    for (const entry of this.queue.splice(0)) {
      entry.dispose();
      entry.reject(jobError("QUEUE_CLEARED", "Server is shutting down"));
    }
  }
}

const compilationQueue = new CompilationQueue({ maxConcurrent: 1, maxQueued: 10 });
// Separate short queue: thumbnails must not wait behind a multi-minute compile.
const thumbnailQueue = new CompilationQueue({ maxConcurrent: 1, maxQueued: 2 });

module.exports = { CompilationQueue, compilationQueue, thumbnailQueue };
