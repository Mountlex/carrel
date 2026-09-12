const { spawn } = require("child_process");
const { getJobSignal } = require("./jobContext");

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_OUTPUT = 10 * 1024 * 1024;
const FORCE_KILL_DELAY = 5000;

/**
 * Wait for a subprocess to exit before its caller cleans up files or releases
 * a queue slot. Cancellation is inherited from the current request job.
 * On Unix, terminate the whole process group, including TeX/biber children.
 */
async function spawnAsync(command, args, options = {}) {
  const {
    cwd, timeout = DEFAULT_TIMEOUT, maxOutput = DEFAULT_MAX_OUTPUT,
    env, logger = console, signal = getJobSignal(), onStdout,
    killProcessGroup = true,
  } = options;
  signal?.throwIfAborted();
  const result = await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let terminating = false;
    let finished = false;
    let forceKillTimer;
    const useProcessGroup = killProcessGroup && process.platform !== "win32";
    const processEnv = { ...process.env, ...(env || {}) };
    if (command === "git") {
      processEnv.GIT_TERMINAL_PROMPT = "0";
      processEnv.GIT_ASKPASS = "/bin/false";
      processEnv.SSH_ASKPASS = "/bin/false";
      processEnv.GCM_INTERACTIVE = "Never";
    }
    const proc = spawn(command, args, { cwd, env: processEnv, detached: useProcessGroup });
    const kill = (killSignal) => {
      if (useProcessGroup && proc.pid) {
        try { process.kill(-proc.pid, killSignal); } catch (error) {
          if (error.code !== "ESRCH") logger.warn?.({ code: error.code }, "Could not signal process group");
        }
      } else {
        proc.kill(killSignal);
      }
    };
    const terminate = () => {
      if (terminating) return;
      terminating = true;
      kill("SIGTERM");
      forceKillTimer = setTimeout(() => kill("SIGKILL"), FORCE_KILL_DELAY);
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      logger.warn?.({ command, timeoutMs: timeout }, "Subprocess timed out");
      terminate();
    }, timeout);
    signal?.addEventListener("abort", terminate, { once: true });
    if (signal?.aborted) terminate();

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      if (stdout.length < maxOutput) stdout += text.slice(0, maxOutput - stdout.length);
      onStdout?.(text);
    });
    proc.stderr.on("data", (data) => {
      if (stderr.length < maxOutput) stderr += data.toString().slice(0, maxOutput - stderr.length);
    });
    // An exited parent may leave children alive with their stdio closed. Kill
    // those too, even if "close" arrives before the escalation timer fires.
    const finish = (code, error) => {
      if (finished) return;
      finished = true;
      if (terminating && useProcessGroup) kill("SIGKILL");
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", terminate);
      resolve({ success: code === 0 && !timedOut && !signal?.aborted,
        stdout, stderr: error?.message || stderr, code, timedOut });
    };
    proc.on("close", (code) => finish(code));
    proc.on("error", (error) => finish(null, error));
  });
  signal?.throwIfAborted();
  return result;
}

/**
 * Run latexmk with proper timeout handling.
 *
 * @param {string} compilerFlag - Compiler flag (-pdf, -xelatex, -lualatex)
 * @param {string} targetPath - Path to the .tex file
 * @param {Object} options - Options object
 * @param {string} options.cwd - Working directory
 * @param {number} [options.timeout=180000] - Timeout in milliseconds (default 3 min)
 * @param {boolean} [options.recorder=false] - Enable -recorder flag for deps detection
 * @param {string} [options.auxdir] - Directory for aux files
 * @param {string} [options.outdir] - Directory for output files
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{success: boolean, log: string, timedOut: boolean}>}
 */
async function runLatexmk(compilerFlag, targetPath, options = {}) {
  const {
    cwd,
    timeout = 180000, // 3 minutes default
    recorder = false,
    auxdir,
    outdir,
    logger = console,
    signal = getJobSignal(),
    onStdout,
    maxOutput = DEFAULT_MAX_OUTPUT,
  } = options;

  const args = [
    compilerFlag,
    "-interaction=nonstopmode",
    "-file-line-error",
    "-cd", // Change to file's directory
    "-f",  // Force processing past errors to complete all passes
  ];

  // -bibtex ensures bibtex/biber runs to generate .bbl files for references
  // (auto-detects bibtex vs biber based on .bcf file presence)
  // Must be included even in recorder mode so .bib dependencies are detected
  args.push("-bibtex");

  if (recorder) {
    args.push("-recorder");
  }

  if (auxdir) {
    args.push(`-auxdir=${auxdir}`);
  }

  if (outdir) {
    args.push(`-outdir=${outdir}`);
  }

  args.push(targetPath);

  logger.info?.(`Running latexmk with args: ${args.join(" ")}`);
  logger.info?.(`Working directory: ${cwd}`);

  const result = await spawnAsync("latexmk", args, {
    cwd,
    timeout,
    logger,
    signal,
    onStdout,
    maxOutput,
  });

  return {
    success: result.success,
    log: result.stdout + result.stderr,
    timedOut: result.timedOut,
  };
}

/**
 * Run pdftoppm for thumbnail generation.
 *
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} outputPrefix - Output file prefix (without extension)
 * @param {Object} options - Options object
 * @param {string} [options.format='png'] - Output format ('png' or 'jpeg')
 * @param {number} [options.width=800] - Output width
 * @param {number} [options.timeout=30000] - Timeout in milliseconds
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{success: boolean, stderr: string, timedOut: boolean}>}
 */
async function runPdftoppm(pdfPath, outputPrefix, options = {}) {
  const {
    format = "png",
    width = 800,
    timeout = 30000,
    logger = console,
  } = options;

  const formatFlag = format === "png" ? "-png" : "-jpeg";

  const args = [
    formatFlag,
    "-f", "1",      // First page
    "-l", "1",      // Last page (same as first = only first page)
    "-singlefile", // Don't add page number suffix
    "-scale-to", String(width),
    pdfPath,
    outputPrefix,
  ];

  const result = await spawnAsync("pdftoppm", args, {
    timeout,
    logger,
  });

  return {
    success: result.success,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}

/**
 * Run latexmk with progress callbacks for real-time status updates.
 * Parses latexmk output to detect compilation passes and bibtex/biber runs.
 *
 * @param {string} compilerFlag - Compiler flag (-pdf, -xelatex, -lualatex)
 * @param {string} targetPath - Path to the .tex file
 * @param {Object} options - Options object
 * @param {string} options.cwd - Working directory
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default 5 min)
 * @param {boolean} [options.recorder=false] - Enable -recorder flag for deps detection
 * @param {string} [options.auxdir] - Directory for aux files
 * @param {string} [options.outdir] - Directory for output files
 * @param {Object} [options.logger] - Logger instance
 * @param {Function} [options.onProgress] - Callback for progress updates (message: string) => void
 * @returns {Promise<{success: boolean, log: string, timedOut: boolean}>}
 */
async function runLatexmkWithProgress(compilerFlag, targetPath, options = {}) {
  const { onProgress, logger = console } = options;
  let currentPass = 0;
  let pendingLine = "";
  const reportLine = (line) => {
    let message;
    if (/Latexmk: applying rule '(pdflatex|xelatex|lualatex)'/.test(line)) {
      message = `Compiling (pass ${++currentPass})...`;
    } else if (/Latexmk: applying rule 'bibtex(?:\s[^']*)?'/.test(line)) {
      message = "Running bibtex...";
    } else if (/Latexmk: applying rule 'biber(?:\s[^']*)?'/.test(line)) {
      message = "Running biber...";
    } else if (/Latexmk: applying rule 'makeindex(?:\s[^']*)?'/.test(line)) {
      message = "Building index...";
    }
    if (message && onProgress) {
      Promise.resolve().then(() => onProgress(message)).catch((error) => {
        logger.warn?.({ err: error }, "Progress callback failed");
      });
    }
  };
  const result = await runLatexmk(compilerFlag, targetPath, {
    timeout: 300000,
    ...options,
    onStdout(text) {
      const lines = (pendingLine + text).split(/\r?\n/);
      pendingLine = lines.pop().slice(-4096);
      for (const line of lines) reportLine(line);
    },
  });
  if (pendingLine) reportLine(pendingLine);
  return result;
}

module.exports = {
  spawnAsync,
  runLatexmk,
  runLatexmkWithProgress,
  runPdftoppm,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_OUTPUT,
};
