const { AsyncLocalStorage } = require("node:async_hooks");

// Carry cancellation through nested Git helpers without coupling them to HTTP.
const jobContext = new AsyncLocalStorage();

function jobError(code, message) {
  return Object.assign(new Error(message), { code });
}

function getJobSignal() {
  return jobContext.getStore()?.signal;
}

function checkJob() {
  getJobSignal()?.throwIfAborted();
}

module.exports = { jobContext, jobError, getJobSignal, checkJob };
