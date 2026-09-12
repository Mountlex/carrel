// Fly allows 35s. Drain normally for 20s, then cancel jobs and leave time for
// process-group termination (5s) and cleanup before our own 30s hard deadline.
function createShutdownHandler({ server, queues, abortJobs, activeJobCount,
  cleanup, logger, exit = (code) => process.exit(code), drainMs = 20000, forceMs = 30000 }) {
  let shuttingDown = false;
  return async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down; refusing queued work");
    queues.forEach((queue) => queue.clear());
    const cancelTimer = setTimeout(abortJobs, drainMs);
    const forceTimer = setTimeout(() => {
      logger.error("Shutdown deadline exceeded");
      exit(1);
    }, forceMs);
    try {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      // A disconnected client can close its HTTP connection before its job has
      // finished terminating subprocesses. Do not delete its files early.
      while (activeJobCount() > 0) await new Promise((resolve) => setTimeout(resolve, 50));
      await cleanup(logger);
      logger.info("Shutdown complete");
      exit(0);
    } catch (error) {
      logger.error({ err: error }, "Shutdown failed");
      exit(1);
    } finally {
      clearTimeout(cancelTimer);
      clearTimeout(forceTimer);
    }
  };
}

module.exports = { createShutdownHandler };
