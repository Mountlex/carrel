const express = require("express");
const compression = require("compression");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

// Import utilities
const { logger, createRequestLogger } = require("./lib/logger");
const { spawnAsync, runLatexmk, runLatexmkWithProgress, runPdftoppm } = require("./lib/subprocess");
const { cloneRepository, cloneRepositorySparse, BINARY_EXTENSIONS } = require("./lib/gitOperations");
const { withCleanup, cleanupAllPendingWorkDirs } = require("./lib/cleanup");
const { rateLimit } = require("./lib/rateLimit");
const { compilationQueue } = require("./lib/queue");
const {
  LIMITS,
  safePathAsync,
  validateTarget,
  validateCompiler,
  validateThumbnailOptions,
  validateGitUrl,
  validateFilePath,
} = require("./lib/validation");

const app = express();
const PORT = process.env.PORT || 3001;
const WORK_DIR = process.env.WORK_DIR || "/tmp";
const JOBS_ROOT = path.join(WORK_DIR, "jobs");
const CACHE_ROOT = process.env.LATEX_CACHE_DIR || path.join(WORK_DIR, "cache");
const CACHE_ALLOWED = (process.env.LATEX_CACHE_ALLOWED || "off").toLowerCase();
const CACHE_TTL_DAYS = Number.parseInt(process.env.LATEX_CACHE_TTL_DAYS || "7", 10);
const CACHE_MAX_GB = Number.parseFloat(process.env.LATEX_CACHE_MAX_GB || "2");
const CACHE_CLEAN_INTERVAL_MS = 60 * 60 * 1000;
const PERSIST_WORKDIR = (process.env.LATEX_PERSIST_WORKDIR || "off").toLowerCase();
const PERSIST_ROOT = process.env.LATEX_PERSIST_DIR || path.join(WORK_DIR, "paper-repos");
const PERSIST_TTL_DAYS = Number.parseInt(process.env.LATEX_PERSIST_TTL_DAYS || String(CACHE_TTL_DAYS), 10);
const PERSIST_MAX_GB = Number.parseFloat(process.env.LATEX_PERSIST_MAX_GB || String(CACHE_MAX_GB));
const PERSIST_LOCK_STALE_MS = Number.parseInt(process.env.LATEX_PERSIST_LOCK_STALE_MS || "900000", 10);
const PERSIST_LOCK_WAIT_MS = Number.parseInt(process.env.LATEX_PERSIST_LOCK_WAIT_MS || "60000", 10);

// Cache for git refs to speed up repeated "Check All" requests
// Key: `${gitUrl}:${branch || 'default'}`, Value: { sha, defaultBranch, details, timestamp }
const refsCache = new Map();
const REFS_CACHE_TTL = 10000; // 10 seconds (matches MIN_SYNC_INTERVAL)

// Request tracking for graceful shutdown
let activeRequests = 0;
let shuttingDown = false;
let cacheCleanupRunning = false;
let persistCleanupRunning = false;

function hashKey(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function resolveCacheMode(requestedMode, paperId) {
  if (CACHE_ALLOWED !== "aux") return "off";
  if (!paperId) return "off";
  return requestedMode === "aux" ? "aux" : "off";
}

function normalizeRepoPath(filePath) {
  if (!filePath || typeof filePath !== "string") return null;
  const trimmed = filePath.trim().replace(/\\/g, "/");
  const withoutPrefix = trimmed.replace(/^\.?\//, "");
  if (!withoutPrefix || withoutPrefix.includes("..") || withoutPrefix.startsWith("/")) {
    return null;
  }
  return withoutPrefix;
}

function buildSparsePaths(target, dependencies) {
  const paths = [".latexmkrc", "latexmkrc"];
  const targetPath = normalizeRepoPath(target);
  if (targetPath) paths.push(targetPath);
  if (Array.isArray(dependencies)) {
    for (const dep of dependencies) {
      const normalized = normalizeRepoPath(dep);
      if (normalized) paths.push(normalized);
    }
  }
  const unique = Array.from(new Set(paths));
  return unique;
}

function extractMissingFile(logText) {
  if (!logText) return null;
  const patterns = [
    /! LaTeX Error: File [`']([^`']+)[`'] not found\./,
    /! I can't find file [`']([^`']+)[`']\./,
  ];
  for (const pattern of patterns) {
    const match = logText.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

function getCacheEntryPaths({ paperId, compiler, target }) {
  const paperKey = hashKey(String(paperId));
  const targetKey = hashKey(String(target));
  const entryDir = path.join(CACHE_ROOT, "papers", paperKey, compiler, targetKey);
  return {
    entryDir,
    auxDir: path.join(entryDir, "aux"),
    outDir: path.join(entryDir, "out"),
    metaPath: path.join(entryDir, "meta.json"),
  };
}

function getPersistentRepoPaths(paperId) {
  const paperKey = hashKey(String(paperId));
  const paperDir = path.join(PERSIST_ROOT, "papers", paperKey);
  return {
    paperDir,
    repoDir: path.join(paperDir, "repo"),
    metaPath: path.join(paperDir, "meta.json"),
    lockPath: path.join(paperDir, ".lock"),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(lockPath, { timeoutMs, staleMs, logger }) {
  const start = Date.now();
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  while (Date.now() - start < timeoutMs) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
      }));
      await handle.close();
      return true;
    } catch (err) {
      if (err && err.code !== "EEXIST") {
        throw err;
      }
      let lockStat = null;
      let lockCreatedAt = null;
      try {
        const content = await fs.readFile(lockPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed.createdAt === "number") {
          lockCreatedAt = parsed.createdAt;
        }
      } catch {
        // ignore parse errors
      }
      try {
        lockStat = await fs.stat(lockPath);
      } catch {
        lockStat = null;
      }
      const lockTimestamp = lockCreatedAt ?? lockStat?.mtimeMs ?? null;
      if (lockTimestamp && staleMs > 0 && Date.now() - lockTimestamp > staleMs) {
        logger?.warn?.("Stale workdir lock detected, removing");
        await fs.rm(lockPath, { force: true });
        continue;
      }
      await sleep(300);
    }
  }
  throw new Error("Timed out waiting for workdir lock");
}

async function releaseLock(lockPath) {
  try {
    await fs.rm(lockPath, { force: true });
  } catch {
    // ignore
  }
}

async function applySparseCheckout(workDir, sparsePaths, logger) {
  if (!sparsePaths || sparsePaths.length === 0) return true;
  const initResult = await spawnAsync(
    "git",
    ["-C", workDir, "sparse-checkout", "init", "--no-cone"],
    { timeout: 20000, logger }
  );
  if (!initResult.success) {
    logger?.warn?.("Failed to init sparse checkout");
    return false;
  }
  const sparseFile = path.join(workDir, ".git", "info", "sparse-checkout");
  await fs.mkdir(path.dirname(sparseFile), { recursive: true });
  await fs.writeFile(sparseFile, sparsePaths.join("\n") + "\n");
  const applyResult = await spawnAsync(
    "git",
    ["-C", workDir, "sparse-checkout", "reapply"],
    { timeout: 20000, logger }
  );
  if (!applyResult.success) {
    logger?.warn?.("Failed to apply sparse checkout");
    return false;
  }
  return true;
}

async function disableSparseCheckout(workDir, logger) {
  const disableResult = await spawnAsync(
    "git",
    ["-C", workDir, "sparse-checkout", "disable"],
    { timeout: 20000, logger }
  );
  if (!disableResult.success) {
    logger?.warn?.("Failed to disable sparse checkout");
    return false;
  }
  return true;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function shouldSkipCacheFile(filePath) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".synctex") || lower.endsWith(".synctex.gz");
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function copyDirFiltered(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, {
    recursive: true,
    filter: (srcPath) => !shouldSkipCacheFile(srcPath),
  });
}

async function writeCacheMeta(metaPath, data) {
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(data, null, 2));
}

async function readCacheMeta(metaPath) {
  try {
    const content = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function getDirSize(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await getDirSize(fullPath);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      total += stat.size;
    }
  }
  return total;
}

async function listCacheEntries() {
  const papersDir = path.join(CACHE_ROOT, "papers");
  const entries = [];
  const paperDirs = await fs.readdir(papersDir, { withFileTypes: true }).catch(() => []);

  for (const paperDir of paperDirs) {
    if (!paperDir.isDirectory()) continue;
    const paperPath = path.join(papersDir, paperDir.name);
    const compilerDirs = await fs.readdir(paperPath, { withFileTypes: true }).catch(() => []);
    for (const compilerDir of compilerDirs) {
      if (!compilerDir.isDirectory()) continue;
      const compilerPath = path.join(paperPath, compilerDir.name);
      const targetDirs = await fs.readdir(compilerPath, { withFileTypes: true }).catch(() => []);
      for (const targetDir of targetDirs) {
        if (!targetDir.isDirectory()) continue;
        const entryDir = path.join(compilerPath, targetDir.name);
        const metaPath = path.join(entryDir, "meta.json");
        let lastUsed = null;
        const meta = await readCacheMeta(metaPath);
        if (meta && typeof meta.lastUsed === "number") {
          lastUsed = meta.lastUsed;
        } else {
          try {
            const stat = await fs.stat(entryDir);
            lastUsed = stat.mtimeMs;
          } catch {
            lastUsed = Date.now();
          }
        }
        let sizeBytes = 0;
        try {
          sizeBytes = await getDirSize(entryDir);
        } catch {
          sizeBytes = 0;
        }
        entries.push({ entryDir, lastUsed, sizeBytes });
      }
    }
  }

  return entries;
}

async function listPersistentEntries() {
  const papersDir = path.join(PERSIST_ROOT, "papers");
  const entries = [];
  const paperDirs = await fs.readdir(papersDir, { withFileTypes: true }).catch(() => []);
  for (const paperDir of paperDirs) {
    if (!paperDir.isDirectory()) continue;
    const paperPath = path.join(papersDir, paperDir.name);
    const metaPath = path.join(paperPath, "meta.json");
    const lockPath = path.join(paperPath, ".lock");
    let lastUsed = null;
    const meta = await readCacheMeta(metaPath);
    if (meta && typeof meta.lastUsed === "number") {
      lastUsed = meta.lastUsed;
    } else {
      try {
        const stat = await fs.stat(paperPath);
        lastUsed = stat.mtimeMs;
      } catch {
        lastUsed = Date.now();
      }
    }
    let sizeBytes = 0;
    try {
      sizeBytes = await getDirSize(paperPath);
    } catch {
      sizeBytes = 0;
    }
    let locked = false;
    let staleLock = false;
    if (await pathExists(lockPath)) {
      let lockTimestamp = null;
      try {
        const lockContent = await fs.readFile(lockPath, "utf-8");
        const parsed = JSON.parse(lockContent);
        if (parsed && typeof parsed.createdAt === "number") {
          lockTimestamp = parsed.createdAt;
        }
      } catch {
        // ignore parse errors
      }
      if (!lockTimestamp) {
        try {
          const stat = await fs.stat(lockPath);
          lockTimestamp = stat.mtimeMs;
        } catch {
          lockTimestamp = null;
        }
      }
      if (lockTimestamp && PERSIST_LOCK_STALE_MS > 0 && Date.now() - lockTimestamp > PERSIST_LOCK_STALE_MS) {
        staleLock = true;
      } else if (lockTimestamp) {
        locked = true;
      }
    }
    entries.push({ entryDir: paperPath, lastUsed, sizeBytes, locked, staleLock, lockPath });
  }
  return entries;
}

async function cleanupCache(logger) {
  if (CACHE_ALLOWED !== "aux") return;
  if (cacheCleanupRunning) return;
  cacheCleanupRunning = true;
  try {
    const entries = await listCacheEntries();
    const now = Date.now();
    const ttlMs = Number.isFinite(CACHE_TTL_DAYS) && CACHE_TTL_DAYS > 0
      ? CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
      : 0;

    const remaining = [];
    for (const entry of entries) {
      if (ttlMs > 0 && now - entry.lastUsed > ttlMs) {
        await fs.rm(entry.entryDir, { recursive: true, force: true });
      } else {
        remaining.push(entry);
      }
    }

    const maxBytes = Number.isFinite(CACHE_MAX_GB) && CACHE_MAX_GB > 0
      ? CACHE_MAX_GB * 1024 * 1024 * 1024
      : 0;

    if (maxBytes > 0) {
      let totalBytes = remaining.reduce((sum, entry) => sum + entry.sizeBytes, 0);
      if (totalBytes > maxBytes) {
        remaining.sort((a, b) => a.lastUsed - b.lastUsed);
        for (const entry of remaining) {
          if (totalBytes <= maxBytes) break;
          await fs.rm(entry.entryDir, { recursive: true, force: true });
          totalBytes -= entry.sizeBytes;
        }
      }
    }
  } catch (err) {
    logger?.warn?.({ err }, "Cache cleanup failed");
  } finally {
    cacheCleanupRunning = false;
  }
}

async function cleanupPersistentWorkdirs(logger) {
  if (PERSIST_WORKDIR !== "on") return;
  if (persistCleanupRunning) return;
  persistCleanupRunning = true;
  try {
    const entries = await listPersistentEntries();
    const now = Date.now();
    const ttlMs = Number.isFinite(PERSIST_TTL_DAYS) && PERSIST_TTL_DAYS > 0
      ? PERSIST_TTL_DAYS * 24 * 60 * 60 * 1000
      : 0;

    const remaining = [];
    for (const entry of entries) {
      if (entry.staleLock && entry.lockPath) {
        await fs.rm(entry.lockPath, { force: true });
      }
      if (entry.locked && !entry.staleLock) {
        remaining.push(entry);
        continue;
      }
      if (ttlMs > 0 && now - entry.lastUsed > ttlMs) {
        await fs.rm(entry.entryDir, { recursive: true, force: true });
      } else {
        remaining.push(entry);
      }
    }

    const maxBytes = Number.isFinite(PERSIST_MAX_GB) && PERSIST_MAX_GB > 0
      ? PERSIST_MAX_GB * 1024 * 1024 * 1024
      : 0;

    if (maxBytes > 0) {
      let totalBytes = remaining.reduce((sum, entry) => sum + entry.sizeBytes, 0);
      if (totalBytes > maxBytes) {
        const candidates = remaining.filter((entry) => !entry.locked);
        candidates.sort((a, b) => a.lastUsed - b.lastUsed);
        for (const entry of candidates) {
          if (totalBytes <= maxBytes) break;
          await fs.rm(entry.entryDir, { recursive: true, force: true });
          totalBytes -= entry.sizeBytes;
        }
      }
    }
  } catch (err) {
    logger?.warn?.({ err }, "Persistent workdir cleanup failed");
  } finally {
    persistCleanupRunning = false;
  }
}

function scheduleCacheCleanup(logger) {
  if (CACHE_ALLOWED !== "aux" && PERSIST_WORKDIR !== "on") return;
  if (CACHE_ALLOWED === "aux") {
    cleanupCache(logger);
  }
  if (PERSIST_WORKDIR === "on") {
    cleanupPersistentWorkdirs(logger);
  }
  setInterval(() => {
    if (CACHE_ALLOWED === "aux") {
      cleanupCache(logger);
    }
    if (PERSIST_WORKDIR === "on") {
      cleanupPersistentWorkdirs(logger);
    }
  }, CACHE_CLEAN_INTERVAL_MS);
}

// Middleware to track active requests and reject new requests during shutdown
function requestTracker(req, res, next) {
  if (shuttingDown && req.path !== "/health") {
    return res.status(503).json({ error: "Server is shutting down" });
  }
  activeRequests++;
  res.on("finish", () => {
    activeRequests--;
  });
  res.on("close", () => {
    // Handle aborted requests
    if (!res.writableEnded) {
      activeRequests--;
    }
  });
  next();
}

app.use(requestTracker);

// CORS configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["*"];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Request ID tracking and logging
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || uuidv4();
  req.requestId = requestId;
  req.log = createRequestLogger(requestId, req.path);
  res.setHeader("X-Request-Id", requestId);
  next();
});

// Response compression (skip for binary responses like PDFs and images)
app.use(compression({
  filter: (req, res) => {
    const contentType = res.getHeader("Content-Type");
    if (contentType && (
      contentType.includes("application/pdf") ||
      contentType.includes("image/")
    )) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// API Key authentication
const API_KEY = process.env.LATEX_SERVICE_API_KEY;

function apiKeyAuth(req, res, next) {
  if (req.path === "/health") {
    return next();
  }

  if (API_KEY) {
    // Prefer header, but allow query param with deprecation warning
    let providedKey = req.headers["x-api-key"];
    if (!providedKey && req.query.api_key) {
      req.log.warn("API key in query params is deprecated, use X-API-Key header instead");
      providedKey = req.query.api_key;
    }
    if (!providedKey || providedKey !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing API key" });
    }
    req.apiKey = providedKey;
  }

  next();
}

app.use(apiKeyAuth);

// Parse JSON bodies
app.use(express.json({ limit: "50mb" }));

// Helper to check if a command is available
async function checkCommand(command, args = ["--version"]) {
  try {
    const result = await spawnAsync(command, args, { timeout: 5000 });
    return { ok: result.success, version: result.stdout.trim().split("\n")[0] };
  } catch {
    return { ok: false, version: null };
  }
}

// Health check with dependency verification
app.get("/health", async (req, res) => {
  const checks = {
    latexmk: await checkCommand("latexmk", ["--version"]),
    git: await checkCommand("git", ["--version"]),
    pdftoppm: await checkCommand("pdftoppm", ["-v"]),
  };

  const healthy = Object.values(checks).every(c => c.ok);
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    queue: compilationQueue.stats(),
  });
});

// Helper to build authenticated git URL
function buildAuthenticatedUrl(gitUrl, auth) {
  if (!auth || !auth.username || !auth.password) {
    return gitUrl;
  }
  const url = new URL(gitUrl);
  url.username = encodeURIComponent(auth.username);
  url.password = encodeURIComponent(auth.password);
  return url.toString();
}

// Compile from git - clone repo and compile directly
app.post("/compile-from-git", rateLimit, async (req, res) => {
  try {
    await compilationQueue.run(async () => {
      const jobId = uuidv4();
      const jobDir = path.join(JOBS_ROOT, jobId);

      await withCleanup(jobDir, async () => {
        const {
          gitUrl,
          branch,
          target,
          auth,
          compiler = "pdflatex",
          progressCallback,
          cacheMode: requestedCacheMode,
          paperId,
          knownDependencies,
        } = req.body;
        const cacheMode = resolveCacheMode(requestedCacheMode, paperId);
        const hasKnownDeps = Array.isArray(knownDependencies) && knownDependencies.length > 0;
        let sparsePaths = hasKnownDeps
          ? buildSparsePaths(target, knownDependencies)
          : [];
        let effectiveSparsePaths = sparsePaths;
        let workDir = path.join(jobDir, "repo");
        let persistPaths = null;
        let persistMeta = null;
        let persistEnabled = false;
        let lockHeld = false;

        // Helper to send progress callbacks (fire-and-forget, don't block on errors)
        const sendProgress = async (message) => {
          if (progressCallback && progressCallback.url && progressCallback.paperId) {
            try {
              const resp = await fetch(progressCallback.url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Compile-Secret": progressCallback.secret || "",
                },
                body: JSON.stringify({
                  paperId: progressCallback.paperId,
                  progress: message,
                }),
              });
              if (!resp.ok) {
                req.log.warn(`Progress callback failed: ${resp.status} ${resp.statusText}`);
              }
            } catch (err) {
              req.log.warn({ err }, "Failed to send progress callback");
            }
          }
        };

        const gitUrlValidation = validateGitUrl(gitUrl);
        if (!gitUrlValidation.valid) {
          return res.status(400).json({ error: gitUrlValidation.error });
        }

        const targetValidation = validateTarget(target);
        if (!targetValidation.valid) {
          return res.status(400).json({ error: targetValidation.error });
        }

        const compilerValidation = validateCompiler(compiler);
        if (!compilerValidation.valid) {
          return res.status(400).json({ error: compilerValidation.error });
        }

        let cacheEnabled = cacheMode === "aux";
        const jobAuxDir = path.join(jobDir, "aux");
        const jobOutDir = path.join(jobDir, "out");
        const cachePaths = cacheEnabled
          ? getCacheEntryPaths({ paperId, compiler, target })
          : null;

        if (cacheEnabled) {
          try {
            await fs.mkdir(path.join(CACHE_ROOT, "papers"), { recursive: true });
          } catch (err) {
            cacheEnabled = false;
            req.log.warn({ err }, "Cache disabled: unable to create cache directory");
          }
        }
        req.log.info(`Cache mode: ${cacheEnabled ? "aux" : "off"}`);

        if (cacheEnabled && PERSIST_WORKDIR === "on" && paperId) {
          persistEnabled = true;
          try {
            await fs.mkdir(path.join(PERSIST_ROOT, "papers"), { recursive: true });
          } catch (err) {
            persistEnabled = false;
            req.log.warn({ err }, "Persistent workdir disabled: unable to create directory");
          }
        }

        if (persistEnabled) {
          try {
            persistPaths = getPersistentRepoPaths(paperId);
            await fs.mkdir(persistPaths.paperDir, { recursive: true });
            await acquireLock(persistPaths.lockPath, {
              timeoutMs: PERSIST_LOCK_WAIT_MS,
              staleMs: PERSIST_LOCK_STALE_MS,
              logger: req.log,
            });
            lockHeld = true;
            persistMeta = await readCacheMeta(persistPaths.metaPath);
            if (persistMeta && (persistMeta.gitUrl !== gitUrl || persistMeta.branch !== branch)) {
              req.log.info("Persistent repo metadata mismatch, resetting workdir");
              await fs.rm(persistPaths.repoDir, { recursive: true, force: true });
              persistMeta = null;
            }
            if (persistMeta && (persistMeta.target !== target || persistMeta.compiler !== compiler)) {
              req.log.info("Persistent aux/out mismatch, clearing aux/out");
              await fs.rm(path.join(persistPaths.paperDir, "aux"), { recursive: true, force: true });
              await fs.rm(path.join(persistPaths.paperDir, "out"), { recursive: true, force: true });
            }
            workDir = persistPaths.repoDir;
          } catch (err) {
            persistEnabled = false;
            req.log.warn({ err }, "Persistent workdir disabled: lock or init failed");
            if (lockHeld && persistPaths?.lockPath) {
              await releaseLock(persistPaths.lockPath);
              lockHeld = false;
            }
          }
        }

        if (!hasKnownDeps && persistMeta?.sparsePaths?.length) {
          sparsePaths = buildSparsePaths(target, persistMeta.sparsePaths);
          effectiveSparsePaths = sparsePaths;
        }

        let activeAuxDir = jobAuxDir;
        let activeOutDir = jobOutDir;
        if (persistEnabled && persistPaths) {
          activeAuxDir = path.join(persistPaths.paperDir, "aux");
          activeOutDir = path.join(persistPaths.paperDir, "out");
          await fs.mkdir(activeAuxDir, { recursive: true });
          await fs.mkdir(activeOutDir, { recursive: true });
          req.log.info("Persistent workdir: enabled (reusing aux/out)");
        }

        if (sparsePaths.length > 0) {
          req.log.info(`Using sparse clone with ${sparsePaths.length} paths`);
        }

        try {
          const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

          // Clone or update repository
          if (persistEnabled) {
            const gitDir = path.join(workDir, ".git");
            const repoExists = await pathExists(gitDir);
            await sendProgress(repoExists ? "Updating repository..." : "Cloning repository...");
            req.log.info(repoExists ? "Updating repository..." : "Cloning repository...");

            if (!repoExists) {
              await fs.rm(workDir, { recursive: true, force: true });
              const cloneResult = sparsePaths.length > 0
                ? await cloneRepositorySparse({
                    authenticatedUrl,
                    workDir,
                    branch,
                    sparsePaths,
                    timeout: 180000,
                    logger: req.log,
                  })
                : await cloneRepository({
                    authenticatedUrl,
                    workDir,
                    branch,
                    timeout: 180000,
                    logger: req.log,
                  });
              if (!cloneResult.success) {
                if (sparsePaths.length > 0) {
                  req.log.warn("Sparse clone failed, retrying with full clone");
                  await fs.rm(workDir, { recursive: true, force: true });
                  const fullCloneResult = await cloneRepository({
                    authenticatedUrl,
                    workDir,
                    branch,
                    timeout: 180000,
                    logger: req.log,
                  });
                  if (!fullCloneResult.success) {
                    return res.status(400).json({ error: fullCloneResult.error });
                  }
                } else {
                  return res.status(400).json({ error: cloneResult.error });
                }
              }
            } else {
              const setUrl = await spawnAsync(
                "git",
                ["-C", workDir, "remote", "set-url", "origin", authenticatedUrl],
                { timeout: 20000, logger: req.log }
              );
              if (!setUrl.success) {
                req.log.warn("Failed to update git remote URL, continuing");
              }
              const fetchResult = await spawnAsync(
                "git",
                ["-C", workDir, "fetch", "--depth", "1", "origin", branch],
                { timeout: 60000, logger: req.log }
              );
              if (!fetchResult.success) {
                return res.status(400).json({ error: fetchResult.stderr || "Failed to fetch repository" });
              }
              const localRev = await spawnAsync(
                "git",
                ["-C", workDir, "rev-parse", "HEAD"],
                { timeout: 10000, logger: req.log }
              );
              const remoteRev = await spawnAsync(
                "git",
                ["-C", workDir, "rev-parse", "FETCH_HEAD"],
                { timeout: 10000, logger: req.log }
              );
              if (!localRev.success || !remoteRev.success || localRev.stdout.trim() !== remoteRev.stdout.trim()) {
                const resetResult = await spawnAsync(
                  "git",
                  ["-C", workDir, "reset", "--hard", "FETCH_HEAD"],
                  { timeout: 20000, logger: req.log }
                );
                if (!resetResult.success) {
                  return res.status(400).json({ error: resetResult.stderr || "Failed to reset repository" });
                }
              } else {
                req.log.info("Repository already up to date");
              }
              const cleanResult = await spawnAsync(
                "git",
                ["-C", workDir, "clean", "-fd"],
                { timeout: 20000, logger: req.log }
              );
              if (!cleanResult.success) {
                req.log.warn("Failed to clean repository");
              }
              if (sparsePaths.length > 0) {
                const applied = await applySparseCheckout(workDir, sparsePaths, req.log);
                if (!applied) {
                  req.log.warn("Sparse checkout apply failed; continuing with existing checkout");
                }
              } else {
                await disableSparseCheckout(workDir, req.log);
              }
            }
          } else {
            await sendProgress("Cloning repository...");
            req.log.info("Cloning repository...");
            const cloneResult = sparsePaths.length > 0
              ? await cloneRepositorySparse({
                  authenticatedUrl,
                  workDir,
                  branch,
                  sparsePaths,
                  timeout: 180000,
                  logger: req.log,
                })
              : await cloneRepository({
                  authenticatedUrl,
                  workDir,
                  branch,
                  timeout: 180000,
                  logger: req.log,
                });

            if (!cloneResult.success) {
              if (sparsePaths.length > 0) {
                req.log.warn("Sparse clone failed, retrying with full clone");
                await fs.rm(workDir, { recursive: true, force: true });
                const fullCloneResult = await cloneRepository({
                  authenticatedUrl,
                  workDir,
                  branch,
                  timeout: 180000,
                  logger: req.log,
                });
                if (!fullCloneResult.success) {
                  return res.status(400).json({ error: fullCloneResult.error });
                }
              } else {
                return res.status(400).json({ error: cloneResult.error });
              }
            }
          }

        // Log sparse checkout details and checked out file count for debugging
        if (sparsePaths.length > 0) {
          const sparseList = await spawnAsync(
            "git",
            ["-C", workDir, "sparse-checkout", "list"],
            { timeout: 10000, logger: req.log }
          );
          if (sparseList.success) {
            const entries = sparseList.stdout
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            const preview = entries.slice(0, 20).join(", ");
            req.log.info(`Sparse checkout list (${entries.length}): ${preview}${entries.length > 20 ? " …" : ""}`);
          } else {
            req.log.warn("Failed to read sparse checkout list");
          }
        }

        const filesList = await spawnAsync(
          "git",
          ["-C", workDir, "ls-files"],
          { timeout: 20000, logger: req.log }
        );
        if (filesList.success) {
          const fileCount = filesList.stdout.trim()
            ? filesList.stdout.trim().split("\n").length
            : 0;
          req.log.info(`Checked out files: ${fileCount}`);
        } else {
          req.log.warn("Failed to count checked out files");
        }

        // Run latexmk with -recorder to track dependencies
        const targetPath = await safePathAsync(workDir, target);
        if (!targetPath) {
          return res.status(400).json({ error: "Invalid target path" });
        }
        const targetDir = path.dirname(targetPath);
        const targetName = path.basename(targetPath, ".tex");

        // Check if target file exists
        try {
          await fs.access(targetPath);
        } catch {
          return res.status(404).json({ error: `Target file not found: ${target}` });
        }

        if (cacheEnabled && cachePaths && !persistEnabled) {
          try {
            await fs.mkdir(activeAuxDir, { recursive: true });
            await fs.mkdir(activeOutDir, { recursive: true });
            let restored = false;
            if (await pathExists(cachePaths.auxDir)) {
              await copyDir(cachePaths.auxDir, activeAuxDir);
              restored = true;
            }
            if (await pathExists(cachePaths.outDir)) {
              await copyDir(cachePaths.outDir, activeOutDir);
              restored = true;
            }
            req.log.info(`Cache restore: ${restored ? "hit" : "miss"}`);
            await writeCacheMeta(cachePaths.metaPath, {
              lastUsed: Date.now(),
              paperId,
              compiler,
              target,
              cacheMode: "aux",
            });
          } catch (err) {
            cacheEnabled = false;
            req.log.warn({ err }, "Cache restore failed, proceeding without cache");
          }
        }

        const compilerFlag = compiler === "xelatex" ? "-xelatex"
                           : compiler === "lualatex" ? "-lualatex"
                           : "-pdf";
        const outputDir = cacheEnabled ? activeOutDir : targetDir;
        const auxDir = cacheEnabled ? activeAuxDir : targetDir;

        await sendProgress("Starting compilation...");
        req.log.info(`Compiling ${target} with ${compiler}...`);

        // Use progress-enabled latexmk if callback is configured
        const latexOptions = {
          cwd: targetDir,
          timeout: 300000,
          recorder: true,
          logger: req.log,
          ...(cacheEnabled ? { auxdir: activeAuxDir, outdir: activeOutDir } : {}),
        };
        const runCompile = async () => {
          const result = progressCallback
            ? await runLatexmkWithProgress(compilerFlag, targetPath, {
                ...latexOptions,
                onProgress: sendProgress,
              })
            : await runLatexmk(compilerFlag, targetPath, latexOptions);

          const pdfPath = path.join(outputDir, `${targetName}.pdf`);
          try {
            await fs.access(pdfPath);
            return { success: true, pdfPath, log: result.log, timedOut: result.timedOut };
          } catch {
            const logPath = path.join(outputDir, `${targetName}.log`);
            let logContent = result.log;
            try {
              logContent = await fs.readFile(logPath, "utf-8");
            } catch {
              // No log file
            }
            return { success: false, pdfPath, log: logContent, timedOut: result.timedOut };
          }
        };

        let compileResult = await runCompile();

        if (!compileResult.success && sparsePaths.length > 0) {
          const missingFile = extractMissingFile(compileResult.log);
          if (missingFile) {
            req.log.warn(`Missing file detected: ${missingFile}`);
            const normalizedMissing = normalizeRepoPath(missingFile) || normalizeRepoPath(`${missingFile}`);
            let sparseAdded = false;
            let addedPath = null;

            if (normalizedMissing) {
              const lsResult = await spawnAsync(
                "git",
                ["-C", workDir, "ls-tree", "-r", "--name-only", "HEAD", normalizedMissing],
                { timeout: 10000, logger: req.log }
              );
              if (lsResult.success && lsResult.stdout.trim()) {
                const sparseFile = path.join(workDir, ".git", "info", "sparse-checkout");
                const existing = await fs.readFile(sparseFile, "utf-8").catch(() => "");
                if (!existing.split("\n").includes(normalizedMissing)) {
                  await fs.writeFile(sparseFile, existing + normalizedMissing + "\n");
                  addedPath = normalizedMissing;
                }
                await spawnAsync("git", ["-C", workDir, "sparse-checkout", "reapply"], {
                  timeout: 20000,
                  logger: req.log,
                });
                sparseAdded = true;
              }
            }

            if (!sparseAdded) {
              const basename = missingFile.split("/").pop();
              const listResult = await spawnAsync(
                "git",
                ["-C", workDir, "ls-tree", "-r", "--name-only", "HEAD"],
                { timeout: 20000, logger: req.log }
              );
              if (listResult.success && basename) {
                const matches = listResult.stdout
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line && (line === basename || line.endsWith(`/${basename}`)));
                if (matches.length === 1) {
                  const sparseFile = path.join(workDir, ".git", "info", "sparse-checkout");
                  const existing = await fs.readFile(sparseFile, "utf-8").catch(() => "");
                  if (!existing.split("\n").includes(matches[0])) {
                    await fs.writeFile(sparseFile, existing + matches[0] + "\n");
                    addedPath = matches[0];
                  }
                  await spawnAsync("git", ["-C", workDir, "sparse-checkout", "reapply"], {
                    timeout: 20000,
                    logger: req.log,
                  });
                  sparseAdded = true;
                }
              }
            }

            if (sparseAdded) {
              if (addedPath) {
                effectiveSparsePaths = Array.from(new Set([...(effectiveSparsePaths || []), addedPath]));
              }
              req.log.info("Sparse checkout updated with missing file, retrying compile");
              compileResult = await runCompile();
            }
          }
        }

        if (!compileResult.success) {
          return res.status(400).json({
            error: "Compilation failed",
            log: compileResult.log,
            timedOut: compileResult.timedOut,
          });
        }

        // Compilation succeeded
        await sendProgress("Finalizing...");

        // Parse .fls file for dependencies
        const deps = new Set();
        const flsCandidates = Array.from(new Set([
          path.join(outputDir, `${targetName}.fls`),
          path.join(auxDir, `${targetName}.fls`),
          path.join(targetDir, `${targetName}.fls`),
        ]));
        let flsPath = null;
        for (const candidate of flsCandidates) {
          if (await pathExists(candidate)) {
            flsPath = candidate;
            break;
          }
        }
        try {
          if (!flsPath) {
            throw new Error("No .fls file found");
          }
          const flsContent = await fs.readFile(flsPath, "utf-8");
          const lines = flsContent.split("\n");

          let flsPwd = workDir;
          for (const line of lines) {
            if (line.startsWith("PWD ")) {
              flsPwd = line.substring(4).trim();
              break;
            }
          }

          for (const line of lines) {
            if (line.startsWith("INPUT ")) {
              const inputPath = line.substring(6).trim();
              let fullPath = null;
              let relativePath = null;

              // Resolve the full path based on how it's specified in .fls
              if (inputPath.startsWith("/")) {
                // Absolute path - use directly if it's within workDir
                if (inputPath.startsWith(workDir + "/")) {
                  fullPath = inputPath;
                  relativePath = path.relative(workDir, inputPath);
                }
                // Skip absolute paths outside workDir (system files)
              } else if (inputPath.startsWith("./")) {
                // Relative to flsPwd (compilation directory)
                fullPath = path.join(flsPwd, inputPath.substring(2));
                relativePath = path.relative(workDir, fullPath);
              } else {
                // Plain relative path - relative to flsPwd
                fullPath = path.join(flsPwd, inputPath);
                relativePath = path.relative(workDir, fullPath);
              }

              if (relativePath && !relativePath.startsWith("..") && !relativePath.match(/\.(aux|log|fls|fdb_latexmk|out|toc|lof|lot|bbl|blg|bcf|run\.xml)$/)) {
                // Check if file exists in repo (not a system file)
                try {
                  await fs.access(fullPath);
                  deps.add(relativePath);
                } catch {
                  // File doesn't exist in repo, skip
                }
              }
            }
          }
        } catch {
          // .fls file might not exist
          req.log.warn("No .fls file found; dependency list may be incomplete");
        }

        // Check for .bib files used
        const auxPath = path.join(auxDir, `${targetName}.aux`);
        try {
          const auxContent = await fs.readFile(auxPath, "utf-8");
          const bibdataMatches = auxContent.matchAll(/\\bibdata\{([^}]+)\}/g);
          for (const match of bibdataMatches) {
            const bibFiles = match[1].split(",").map(f => f.trim());
            for (const bibFile of bibFiles) {
              const bibWithExt = bibFile.endsWith(".bib") ? bibFile : `${bibFile}.bib`;
              const fullPath = path.join(workDir, bibWithExt);
              try {
                await fs.access(fullPath);
                deps.add(bibWithExt);
              } catch {
                // Try in target directory
                const altPath = path.join(targetDir, bibWithExt);
                try {
                  await fs.access(altPath);
                  const relPath = path.relative(workDir, altPath);
                  deps.add(relPath);
                } catch {
                  // File not found
                }
              }
            }
          }
        } catch {
          // No aux file
        }

        // Also check .bcf file for biblatex
        const bcfPaths = [
          path.join(auxDir, `${targetName}.bcf`),
          path.join(outputDir, `${targetName}.bcf`),
        ];
        try {
          let bcfContent = null;
          for (const bcfPath of bcfPaths) {
            try {
              bcfContent = await fs.readFile(bcfPath, "utf-8");
              break;
            } catch {
              // Try next path
            }
          }
          if (!bcfContent) {
            throw new Error("No bcf file");
          }
          const datasourcePattern = /<bcf:datasource[^>]*>([^<]+)<\/bcf:datasource>/g;
          let dsMatch;
          while ((dsMatch = datasourcePattern.exec(bcfContent)) !== null) {
            if (dsMatch[1]) {
              const bibFile = dsMatch[1];
              const bibWithExt = bibFile.endsWith(".bib") ? bibFile : `${bibFile}.bib`;
              const fullPath = path.join(workDir, bibWithExt);
              try {
                await fs.access(fullPath);
                deps.add(bibWithExt);
              } catch {
                // Try in target directory
                const altPath = path.join(targetDir, bibWithExt);
                try {
                  await fs.access(altPath);
                  const relPath = path.relative(workDir, altPath);
                  deps.add(relPath);
                } catch {
                  // File not found
                }
              }
            }
          }
        } catch {
          // No bcf file
        }

        if (cacheEnabled && cachePaths && !persistEnabled) {
          try {
            const tempEntryDir = `${cachePaths.entryDir}.tmp-${jobId}`;
            await fs.rm(tempEntryDir, { recursive: true, force: true });
            await fs.mkdir(tempEntryDir, { recursive: true });
            if (await pathExists(activeAuxDir)) {
              await copyDirFiltered(activeAuxDir, path.join(tempEntryDir, "aux"));
            }
            if (await pathExists(activeOutDir)) {
              await copyDirFiltered(activeOutDir, path.join(tempEntryDir, "out"));
            }
            await writeCacheMeta(path.join(tempEntryDir, "meta.json"), {
              lastUsed: Date.now(),
              paperId,
              compiler,
              target,
              cacheMode: "aux",
            });
            await fs.rm(cachePaths.entryDir, { recursive: true, force: true });
            await fs.rename(tempEntryDir, cachePaths.entryDir);
            req.log.info("Cache persist: success");
          } catch (err) {
            req.log.warn({ err }, "Failed to persist cache");
          }
        }

        // Read and return PDF with dependencies in header
        const pdfBuffer = await fs.readFile(compileResult.pdfPath);
        req.log.info(`Compilation successful, PDF size: ${pdfBuffer.length} bytes`);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", pdfBuffer.length);
        if (deps.size > 0) {
          res.setHeader("X-Dependencies", JSON.stringify(Array.from(deps)));
        }
        res.send(pdfBuffer);
        } finally {
          if (persistEnabled && persistPaths?.metaPath) {
            try {
              const dedupedSparse = Array.from(new Set(effectiveSparsePaths || []));
              await writeCacheMeta(persistPaths.metaPath, {
                lastUsed: Date.now(),
                gitUrl,
                branch,
                paperId,
                target,
                compiler,
                sparsePaths: dedupedSparse,
              });
            } catch (err) {
              req.log.warn({ err }, "Failed to update persistent workdir metadata");
            }
          }
          if (lockHeld && persistPaths?.lockPath) {
            await releaseLock(persistPaths.lockPath);
            lockHeld = false;
          }
        }
      }, req.log);
    }, { logger: req.log });
  } catch (err) {
    if (err.code === "QUEUE_FULL") {
      return res.status(503).json({
        error: "Server is busy. Please try again later.",
        queue: err.stats,
        retryAfter: 30,
      });
    }
    throw err;
  }
});

// Clear cache entries for one or more papers
app.post("/cache/clear", rateLimit, async (req, res) => {
  const { paperId, paperIds } = req.body || {};
  const ids = Array.isArray(paperIds)
    ? paperIds.filter(Boolean)
    : (paperId ? [paperId] : []);

  if (ids.length === 0) {
    return res.status(400).json({ error: "Missing paperId or paperIds" });
  }

  let deleted = 0;
  for (const id of ids) {
    const paperKey = hashKey(String(id));
    const paperCacheDir = path.join(CACHE_ROOT, "papers", paperKey);
    try {
      await fs.rm(paperCacheDir, { recursive: true, force: true });
      deleted++;
    } catch (err) {
      logger.warn({ err }, `Failed to clear cache for paper ${id}`);
    }
    try {
      const persistPaths = getPersistentRepoPaths(id);
      await fs.rm(persistPaths.paperDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn({ err }, `Failed to clear persistent repo for paper ${id}`);
    }
  }

  res.json({ deleted });
});

// Git refs endpoint
app.post("/git/refs", rateLimit, async (req, res) => {
  const { gitUrl, branch, auth, knownSha } = req.body;

  const gitUrlValidation = validateGitUrl(gitUrl);
  if (!gitUrlValidation.valid) {
    return res.status(400).json({ error: gitUrlValidation.error });
  }

  // Check cache first
  const cacheKey = `${gitUrl}:${branch || "default"}`;
  const cached = refsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REFS_CACHE_TTL) {
    // If knownSha provided and matches cached SHA, return unchanged
    if (knownSha && cached.sha === knownSha) {
      return res.json({ sha: cached.sha, defaultBranch: cached.defaultBranch, unchanged: true });
    }
    // Return cached result with full details
    return res.json({
      sha: cached.sha,
      defaultBranch: cached.defaultBranch,
      ...cached.details,
    });
  }

  const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

  // Resolve default branch and HEAD SHA via symref (more accurate than main/master heuristics)
  let headSha = null;
  let defaultBranch = null;

  const symrefResult = await spawnAsync(
    "git",
    ["ls-remote", "--symref", authenticatedUrl, "HEAD"],
    { timeout: 30000, logger: req.log }
  );

  if (symrefResult.success && symrefResult.stdout.trim()) {
    const symrefLines = symrefResult.stdout.trim().split("\n");
    for (const line of symrefLines) {
      if (line.startsWith("ref:")) {
        const [refPart, refName] = line.split("\t");
        if (refName === "HEAD") {
          const ref = refPart.replace("ref:", "").trim();
          if (ref.startsWith("refs/heads/")) {
            defaultBranch = ref.replace("refs/heads/", "");
          }
        }
        continue;
      }
      const [sha, ref] = line.split("\t");
      if (ref === "HEAD") {
        headSha = sha;
      }
    }
  }

  let targetBranch = branch || defaultBranch || "master";
  let requestedSha = null;

  const branchResult = await spawnAsync(
    "git",
    ["ls-remote", authenticatedUrl, `refs/heads/${targetBranch}`],
    { timeout: 30000, logger: req.log }
  );

  if (branchResult.success && branchResult.stdout.trim()) {
    const branchLines = branchResult.stdout.trim().split("\n");
    for (const line of branchLines) {
      const [sha, ref] = line.split("\t");
      if (ref === `refs/heads/${targetBranch}`) {
        requestedSha = sha;
        break;
      }
    }
  }

  // Fall back to a full refs scan if symref or branch lookup failed
  if (!requestedSha || !headSha || !defaultBranch) {
    const result = await spawnAsync("git", ["ls-remote", authenticatedUrl], {
      timeout: 30000,
      logger: req.log,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.stderr || "Failed to access repository" });
    }

    const lines = result.stdout.trim().split("\n");
    const refMap = new Map();
    for (const line of lines) {
      const [sha, ref] = line.split("\t");
      refMap.set(ref, sha);
      if (ref === "HEAD" && !headSha) {
        headSha = sha;
      }
      if (!defaultBranch && (ref === "refs/heads/master" || ref === "refs/heads/main")) {
        defaultBranch = ref.replace("refs/heads/", "");
      }
    }
    if (!branch && defaultBranch) {
      targetBranch = defaultBranch;
      requestedSha = refMap.get(`refs/heads/${targetBranch}`) || requestedSha;
    } else if (!requestedSha) {
      requestedSha = refMap.get(`refs/heads/${targetBranch}`) || null;
    }
  }

  let resolvedSha = requestedSha || headSha;
  const resolvedDefaultBranch = defaultBranch || targetBranch;

  // If SHA hasn't changed, skip the expensive commit date fetch
  // The client already has the date from the previous sync
  if (knownSha && resolvedSha === knownSha) {
    return res.json({
      sha: resolvedSha,
      defaultBranch: resolvedDefaultBranch,
      unchanged: true,
    });
  }

  // SHA changed or no knownSha provided - fetch commit details
  const jobId = uuidv4();
  const workDir = `/tmp/git-refs-${jobId}`;

  await withCleanup(workDir, async () => {
    let commitDate = null;
    let commitMessage = "Latest commit";
    let authorName = null;
    let authorEmail = null;

    if (resolvedSha) {
      try {
        await fs.mkdir(workDir, { recursive: true });

        // Initialize bare repo and fetch just the commit we need
        await spawnAsync("git", ["init", "--bare"], { cwd: workDir, logger: req.log });

        const fetchResult = await spawnAsync(
          "git",
          ["fetch", "--depth=1", authenticatedUrl, `refs/heads/${targetBranch}:refs/heads/${targetBranch}`],
          { cwd: workDir, timeout: 30000, logger: req.log }
        );

        if (fetchResult.success) {
          // Get commit hash, date, message, and author from the fetched ref
          // Format: sha, date, author name, author email, subject
          const logResult = await spawnAsync(
            "git",
            ["log", "-1", "--format=%H%n%cI%n%an%n%ae%n%s", `refs/heads/${targetBranch}`],
            { cwd: workDir, logger: req.log }
          );

          if (logResult.success && logResult.stdout.trim()) {
            const lines = logResult.stdout.trim().split("\n");
            const loggedSha = lines[0];
            if (loggedSha) {
              resolvedSha = loggedSha;
            }
            commitDate = lines[1];
            authorName = lines[2] || null;
            authorEmail = lines[3] || null;
            commitMessage = lines.slice(4).join("\n") || "Latest commit";
          }
        }
      } catch (err) {
        req.log.warn({ err }, "Failed to fetch commit date, using current time");
      }
    }

    const dateIsFallback = !commitDate;
    const responseData = {
      sha: resolvedSha,
      defaultBranch: resolvedDefaultBranch,
      message: commitMessage,
      date: commitDate || new Date().toISOString(),
      dateIsFallback,
      authorName,
      authorEmail,
    };

    // Cache the result for future requests
    refsCache.set(cacheKey, {
      sha: resolvedSha,
      defaultBranch: resolvedDefaultBranch,
      details: {
        message: commitMessage,
        date: responseData.date,
        dateIsFallback,
        authorName,
        authorEmail,
      },
      timestamp: Date.now(),
    });

    res.json(responseData);
  }, req.log);
});

// Git tree endpoint
app.post("/git/tree", rateLimit, async (req, res) => {
  const jobId = uuidv4();
  const workDir = `/tmp/git-tree-${jobId}`;

  await withCleanup(workDir, async () => {
    const { gitUrl, path: requestedPath, branch, auth } = req.body;

    const gitUrlValidation = validateGitUrl(gitUrl);
    if (!gitUrlValidation.valid) {
      return res.status(400).json({ error: gitUrlValidation.error });
    }

    const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

    // Clone with depth 1
    const cloneResult = await cloneRepository({
      authenticatedUrl,
      workDir,
      branch,
      timeout: 60000,
      logger: req.log,
    });

    if (!cloneResult.success) {
      return res.status(400).json({ error: cloneResult.error });
    }

    // List files with path traversal protection
    let targetDir = workDir;
    if (requestedPath) {
      targetDir = await safePathAsync(workDir, requestedPath);
      if (!targetDir) {
        return res.status(400).json({ error: "Invalid path" });
      }
    }

    const files = [];
    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === ".git") continue;

        const filePath = requestedPath ? `${requestedPath}/${entry.name}` : entry.name;
        files.push({
          name: entry.name,
          path: filePath,
          type: entry.isDirectory() ? "dir" : "file",
        });
      }
    } catch {
      return res.status(404).json({ error: `Path not found: ${requestedPath}` });
    }

    res.json({ files });
  }, req.log);
});

// Git file endpoint
app.post("/git/file", rateLimit, async (req, res) => {
  const jobId = uuidv4();
  const workDir = `/tmp/git-file-${jobId}`;

  await withCleanup(workDir, async () => {
    const { gitUrl, filePath, branch, auth } = req.body;

    const gitUrlValidation = validateGitUrl(gitUrl);
    if (!gitUrlValidation.valid) {
      return res.status(400).json({ error: gitUrlValidation.error });
    }

    const filePathValidation = validateFilePath(filePath);
    if (!filePathValidation.valid) {
      return res.status(400).json({ error: filePathValidation.error });
    }

    const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

    const cloneResult = await cloneRepository({
      authenticatedUrl,
      workDir,
      branch,
      timeout: 60000,
      logger: req.log,
    });

    if (!cloneResult.success) {
      return res.status(400).json({ error: cloneResult.error });
    }

    const targetPath = await safePathAsync(workDir, filePath);
    if (!targetPath) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    try {
      const content = await fs.readFile(targetPath);
      const ext = path.extname(filePath).toLowerCase();

      if (BINARY_EXTENSIONS.has(ext)) {
        res.json({
          content: content.toString("base64"),
          encoding: "base64",
        });
      } else {
        res.json({
          content: content.toString("utf-8"),
          encoding: "utf-8",
        });
      }
    } catch {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }
  }, req.log);
});

// Git archive endpoint
app.post("/git/archive", rateLimit, async (req, res) => {
  const jobId = uuidv4();
  const workDir = `/tmp/git-archive-${jobId}`;

  await withCleanup(workDir, async () => {
    const { gitUrl, branch, auth } = req.body;

    const gitUrlValidation = validateGitUrl(gitUrl);
    if (!gitUrlValidation.valid) {
      return res.status(400).json({ error: gitUrlValidation.error });
    }

    const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

    const cloneResult = await cloneRepository({
      authenticatedUrl,
      workDir,
      branch,
      timeout: 180000,
      logger: req.log,
    });

    if (!cloneResult.success) {
      return res.status(400).json({ error: cloneResult.error });
    }

    // Recursively read all files with depth limit and size/count tracking
    const files = [];
    const MAX_DEPTH = 20; // Prevent stack overflow on deeply nested repos

    // Track totals for repository limits
    let totalSize = 0;
    let fileCount = 0;
    let limitExceeded = null; // Will hold error info if limits exceeded

    async function readDir(dirPath, relativePath = "", depth = 0) {
      if (limitExceeded) return; // Stop if limits already exceeded

      if (depth > MAX_DEPTH) {
        req.log.warn(`Max directory depth (${MAX_DEPTH}) exceeded at ${relativePath}`);
        return;
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (limitExceeded) return; // Stop if limits exceeded
        if (entry.name === ".git") continue;
        if (entry.isSymbolicLink()) {
          req.log.warn(`Skipping symlink: ${relativePath ? `${relativePath}/${entry.name}` : entry.name}`);
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await readDir(fullPath, relPath, depth + 1);
        } else {
          try {
            const content = await fs.readFile(fullPath);
            const ext = path.extname(entry.name).toLowerCase();

            // Skip very large files
            if (content.length > LIMITS.MAX_RESOURCE_SIZE) {
              req.log.info(`Skipping large file: ${relPath} (${content.length} bytes)`);
              continue;
            }

            // Check repository size limit
            totalSize += content.length;
            if (totalSize > LIMITS.MAX_REPO_SIZE) {
              limitExceeded = {
                error: "Repository content too large",
                totalSize,
                limit: LIMITS.MAX_REPO_SIZE,
              };
              return;
            }

            // Check repository file count limit
            fileCount++;
            if (fileCount > LIMITS.MAX_REPO_FILES) {
              limitExceeded = {
                error: "Too many files in repository",
                fileCount,
                limit: LIMITS.MAX_REPO_FILES,
              };
              return;
            }

            if (BINARY_EXTENSIONS.has(ext)) {
              files.push({
                path: relPath,
                content: content.toString("base64"),
                encoding: "base64",
              });
            } else {
              files.push({
                path: relPath,
                content: content.toString("utf-8"),
              });
            }
          } catch (e) {
            req.log.error({ err: e }, `Error reading file ${relPath}`);
          }
        }
      }
    }

    await readDir(workDir);

    // Return 413 if limits were exceeded
    if (limitExceeded) {
      return res.status(413).json(limitExceeded);
    }

    res.json({ files });
  }, req.log);
});

// Git selective archive endpoint - fetches only files matching extensions or specific paths
app.post("/git/selective-archive", rateLimit, async (req, res) => {
  const jobId = uuidv4();
  const workDir = `/tmp/git-selective-${jobId}`;

  await withCleanup(workDir, async () => {
    const { gitUrl, branch, auth, extensions, paths } = req.body;

    const gitUrlValidation = validateGitUrl(gitUrl);
    if (!gitUrlValidation.valid) {
      return res.status(400).json({ error: gitUrlValidation.error });
    }

    // Must provide either extensions or paths
    if ((!extensions || extensions.length === 0) && (!paths || paths.length === 0)) {
      return res.status(400).json({ error: "Must provide either 'extensions' or 'paths' array" });
    }

    const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

    const cloneResult = await cloneRepository({
      authenticatedUrl,
      workDir,
      branch,
      timeout: 180000,
      logger: req.log,
    });

    if (!cloneResult.success) {
      return res.status(400).json({ error: cloneResult.error });
    }

    const files = [];
    const MAX_DEPTH = 20;

    // Track totals for repository limits
    let totalSize = 0;
    let fileCount = 0;
    let limitExceeded = null; // Will hold error info if limits exceeded

    // Normalize extensions to lowercase with leading dot
    const normalizedExtensions = extensions
      ? new Set(extensions.map(ext => ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`))
      : null;

    // Normalize paths for lookup
    const normalizedPaths = paths
      ? new Set(paths.map(p => p.replace(/^\//, ""))) // Remove leading slash if present
      : null;

    async function readDir(dirPath, relativePath = "", depth = 0) {
      if (limitExceeded) return; // Stop if limits already exceeded

      if (depth > MAX_DEPTH) {
        req.log.warn(`Max directory depth (${MAX_DEPTH}) exceeded at ${relativePath}`);
        return;
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (limitExceeded) return; // Stop if limits exceeded
        if (entry.name === ".git") continue;
        if (entry.isSymbolicLink()) {
          req.log.warn(`Skipping symlink: ${relativePath ? `${relativePath}/${entry.name}` : entry.name}`);
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await readDir(fullPath, relPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();

          // Check if file matches our filter criteria
          const matchesExtension = normalizedExtensions && normalizedExtensions.has(ext);
          const matchesPath = normalizedPaths && normalizedPaths.has(relPath);

          if (!matchesExtension && !matchesPath) {
            continue; // Skip files that don't match
          }

          try {
            const content = await fs.readFile(fullPath);

            // Skip very large files
            if (content.length > LIMITS.MAX_RESOURCE_SIZE) {
              req.log.info(`Skipping large file: ${relPath} (${content.length} bytes)`);
              continue;
            }

            // Check repository size limit
            totalSize += content.length;
            if (totalSize > LIMITS.MAX_REPO_SIZE) {
              limitExceeded = {
                error: "Repository content too large",
                totalSize,
                limit: LIMITS.MAX_REPO_SIZE,
              };
              return;
            }

            // Check repository file count limit
            fileCount++;
            if (fileCount > LIMITS.MAX_REPO_FILES) {
              limitExceeded = {
                error: "Too many files in repository",
                fileCount,
                limit: LIMITS.MAX_REPO_FILES,
              };
              return;
            }

            if (BINARY_EXTENSIONS.has(ext)) {
              files.push({
                path: relPath,
                content: content.toString("base64"),
                encoding: "base64",
              });
            } else {
              files.push({
                path: relPath,
                content: content.toString("utf-8"),
              });
            }
          } catch (e) {
            req.log.error({ err: e }, `Error reading file ${relPath}`);
          }
        }
      }
    }

    await readDir(workDir);

    // Return 413 if limits were exceeded
    if (limitExceeded) {
      return res.status(413).json(limitExceeded);
    }

    // Report which requested paths were not found (useful for debugging)
    const foundPaths = new Set(files.map(f => f.path));
    const missingPaths = normalizedPaths
      ? Array.from(normalizedPaths).filter(p => !foundPaths.has(p))
      : [];

    res.json({ files, missingPaths });
  }, req.log);
});

// Git file-hash endpoint
app.post("/git/file-hash", rateLimit, async (req, res) => {
  const jobId = uuidv4();
  const workDir = `/tmp/git-hash-${jobId}`;

  await withCleanup(workDir, async () => {
    const { gitUrl, filePath, filePaths, branch, auth } = req.body;

    // Determine if batch request
    const isBatch = Array.isArray(filePaths) && filePaths.length > 0;
    const pathsToProcess = isBatch ? filePaths : (filePath ? [filePath] : []);

    const gitUrlValidation = validateGitUrl(gitUrl);
    if (!gitUrlValidation.valid) {
      return res.status(400).json({ error: gitUrlValidation.error });
    }

    if (pathsToProcess.length === 0) {
      return res.status(400).json({ error: "Missing filePath or filePaths" });
    }

    const authenticatedUrl = buildAuthenticatedUrl(gitUrl, auth);

    const cloneResult = await cloneRepository({
      authenticatedUrl,
      workDir,
      branch,
      timeout: 60000,
      logger: req.log,
    });

    if (!cloneResult.success) {
      return res.status(400).json({ error: cloneResult.error });
    }

    // Process all file paths
    const hashes = {};
    for (const fp of pathsToProcess) {
      const targetPath = await safePathAsync(workDir, fp);
      if (!targetPath) {
        hashes[fp] = null;
        continue;
      }

      try {
        await fs.access(targetPath);
      } catch {
        hashes[fp] = null;
        continue;
      }

      const hashResult = await spawnAsync("git", ["hash-object", fp], {
        cwd: workDir,
        timeout: 10000,
        logger: req.log,
      });

      hashes[fp] = hashResult.success ? hashResult.stdout.trim() : null;
    }

    if (isBatch) {
      res.json({ hashes });
    } else {
      const hash = hashes[filePath];
      if (hash === null) {
        return res.status(404).json({ error: `File not found or invalid: ${filePath}` });
      }
      res.json({ hash });
    }
  }, req.log);
});

// Thumbnail endpoint
app.post("/thumbnail", rateLimit, async (req, res) => {
  const jobId = uuidv4();
  const workDir = `/tmp/thumbnail-${jobId}`;

  await withCleanup(workDir, async () => {
    const { pdfBase64, width = 800, format = "png" } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "Missing pdfBase64" });
    }

    const optionsValidation = validateThumbnailOptions({ width, format });
    if (!optionsValidation.valid) {
      return res.status(400).json({ error: optionsValidation.error });
    }

    await fs.mkdir(workDir, { recursive: true });

    // Decode and write PDF
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const pdfPath = path.join(workDir, "input.pdf");
    await fs.writeFile(pdfPath, pdfBuffer);

    const outputPrefix = path.join(workDir, "thumb");

    const result = await runPdftoppm(pdfPath, outputPrefix, {
      format,
      width,
      timeout: 30000,
      logger: req.log,
    });

    if (!result.success) {
      return res.status(400).json({
        error: `Thumbnail generation failed: ${result.stderr}`,
        timedOut: result.timedOut,
      });
    }

    const ext = format === "png" ? "png" : "jpg";
    const thumbPath = path.join(workDir, `thumb.${ext}`);

    try {
      const thumbBuffer = await fs.readFile(thumbPath);
      const contentType = format === "png" ? "image/png" : "image/jpeg";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", thumbBuffer.length);
      res.send(thumbBuffer);
    } catch {
      return res.status(500).json({ error: "Failed to read generated thumbnail" });
    }
  }, req.log);
});

// Start server with proper configuration
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`LaTeX compilation service running on port ${PORT}`);
  scheduleCacheCleanup(logger);
});

// Set server-level timeouts
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 65000; // Slightly higher than common load balancer timeouts
server.headersTimeout = 66000; // Slightly higher than keepAliveTimeout

// Helper to wait for active requests to drain
function waitForRequestsDrain(maxWaitMs = 25000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (activeRequests === 0) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > maxWaitMs) {
        logger.warn(`${activeRequests} requests still active after ${maxWaitMs}ms, proceeding with cleanup`);
        clearInterval(checkInterval);
        resolve(false);
      } else {
        logger.info(`Waiting for ${activeRequests} active request(s) to complete...`);
      }
    }, 1000);
  });
}

// Graceful shutdown handling
async function shutdown(signal) {
  if (shuttingDown) {
    logger.warn(`Received ${signal} during shutdown, forcing exit`);
    process.exit(1);
  }

  shuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown...`);
  logger.info(`Active requests: ${activeRequests}`);
  logger.info(`Compilation queue: ${JSON.stringify(compilationQueue.stats())}`);

  // Clear queued (not yet started) compilations - they'll get 503 errors
  compilationQueue.clear();

  // Stop accepting new connections
  server.close(async () => {
    logger.info("HTTP server closed, no new connections accepted");

    // Wait for active requests to complete
    if (activeRequests > 0) {
      logger.info(`Waiting for ${activeRequests} active request(s) to drain...`);
      await waitForRequestsDrain();
    }

    // Clean up pending work directories (should be empty if all requests completed)
    await cleanupAllPendingWorkDirs(logger);

    logger.info("Shutdown complete");
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
