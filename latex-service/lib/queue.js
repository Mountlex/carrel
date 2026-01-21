/**
 * Simple in-memory job queue for rate-limiting concurrent compilations.
 * Prevents OOM by ensuring only a few compilations run at once.
 */

class CompilationQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 2;
    this.maxQueued = options.maxQueued || 20;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Get current queue statistics.
   */
  stats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueued: this.maxQueued,
    };
  }

  /**
   * Execute a function with queue management.
   * Resolves when the function completes, or rejects if queue is full.
   *
   * @param {Function} fn - Async function to execute
   * @param {Object} [options] - Options
   * @param {Object} [options.logger] - Logger instance
   * @returns {Promise<any>} - Result of fn()
   */
  async run(fn, options = {}) {
    const { logger = console } = options;

    // Check if queue is full
    if (this.queue.length >= this.maxQueued) {
      const err = new Error("Compilation queue is full");
      err.code = "QUEUE_FULL";
      err.stats = this.stats();
      throw err;
    }

    // If we can run immediately, do so
    if (this.running < this.maxConcurrent) {
      return this._execute(fn, logger);
    }

    // Otherwise, queue it
    logger.info?.(`Queuing request. Position: ${this.queue.length + 1}, running: ${this.running}`);

    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, logger });
    });
  }

  async _execute(fn, logger) {
    this.running++;
    logger.info?.(`Starting compilation. Running: ${this.running}, queued: ${this.queue.length}`);

    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;
      this._processNext();
    }
  }

  _processNext() {
    if (this.queue.length === 0 || this.running >= this.maxConcurrent) {
      return;
    }

    const { fn, resolve, reject, logger } = this.queue.shift();
    logger.info?.(`Dequeuing request. Running: ${this.running + 1}, queued: ${this.queue.length}`);

    this._execute(fn, logger).then(resolve).catch(reject);
  }

  /**
   * Get number of pending items (for graceful shutdown).
   */
  pending() {
    return this.running + this.queue.length;
  }

  /**
   * Clear the queue (rejects all pending with an error).
   */
  clear() {
    const err = new Error("Queue cleared during shutdown");
    err.code = "QUEUE_CLEARED";
    for (const { reject } of this.queue) {
      reject(err);
    }
    this.queue = [];
  }
}

// Singleton instance for compilation jobs
const compilationQueue = new CompilationQueue({
  maxConcurrent: 4,  // Max 4 compilations at once (2 CPUs, 2GB RAM)
  maxQueued: 20,     // Max 20 waiting in queue
});

module.exports = {
  CompilationQueue,
  compilationQueue,
};
