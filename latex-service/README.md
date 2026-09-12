# Carrel LaTeX Service

A self-hosted LaTeX compilation service for Carrel.

## Deployment Options

### Option 1: Fly.io (Recommended)

**Pros:** Easy setup, good free tier, fast deployments
**Cons:** Large image (~4GB) may take a while to deploy initially

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (from latex-service directory)
cd latex-service
fly launch --no-deploy

# Set up volume for faster builds (optional)
fly volumes create latex_cache --size 1

# Deploy
fly deploy

# Get your URL
fly status
```

Your service will be at: `https://your-app-name.fly.dev`

### Option 2: Railway

**Pros:** Git-push deployments, good free tier
**Cons:** May have memory limits on free tier

1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repo and the `latex-service` directory
4. Railway auto-detects the Dockerfile

Your service will be at: `https://your-app.up.railway.app`

### Option 3: Render

**Pros:** Free tier, auto-scaling
**Cons:** Cold starts on free tier

1. Go to [render.com](https://render.com)
2. New → Web Service → Connect your repo
3. Set root directory to `latex-service`
4. Render auto-detects Docker

### Option 4: Local / Self-hosted

```bash
cd latex-service
docker compose up -d
```

Service runs at: `http://localhost:3001`

For a VPS (DigitalOcean, Linode, Hetzner):
```bash
# On your server
git clone <your-repo>
cd carrel/latex-service
docker compose up -d
```

## Configuration

### Build verification

The default Docker target runs `scripts/smoke.cjs` before producing the final
image. It starts a local service and uses a disposable Git repository to verify
cached builds after seven new inputs, bibliography output, all three engines,
PDF text, and thumbnails. It uses no production data or credentials. Temporary
fixtures and generated font caches remain in the intermediate test stage.

JavaScript dependencies are installed with `npm ci` from `package-lock.json`;
the TeX Live base is pinned by digest. Update these deliberately and rerun the
image tests. A normal `flyctl deploy --remote-only` runs the same build checks.

For a local check with TeX and Poppler installed:

```bash
node latex-service/scripts/smoke.cjs
```

### Job limits and Fly shutdown

- One compilation runs per machine, with up to ten waiting requests. Waiting
  requests expire after 60 seconds; queue capacity and shutdown errors return
  HTTP 503 with `Retry-After: 30`.
- Compilation requests have a nine-minute total deadline, including queueing,
  Git operations, sparse recovery, and compilation. Each compiler invocation
  still has a five-minute limit. Deadline failures use the existing HTTP 400
  response with `timedOut: true`, so Convex does not automatically repeat them.
- Thumbnails use a separate queue with one active conversion and two waiting
  requests. Their queue wait is at most five seconds and their total deadline
  is 24 seconds, leaving time to terminate subprocesses before Convex's
  30-second timeout. A thumbnail may run alongside one compilation.
- A disconnected request cancels waiting work and terminates its active Git,
  LaTeX, or thumbnail process group. Cleanup and queue release wait for the
  subprocess runner to finish. Cancellation is carried through nested helpers
  by `lib/jobContext.js`; asynchronous file operations check it between stages.
- Fly's shutdown allowance is 35 seconds. The service rejects queued work,
  drains active requests for 20 seconds, then cancels remaining compilation and
  thumbnail jobs. It has its own 30-second exit deadline. Interrupted jobs get
  retryable errors when the connection is still available; this is not a
  durable background job queue.
- Progress callbacks have a five-second timeout. They cannot block a job
  indefinitely.
- When cached dependencies omit new source files, the service tries up to five
  individual-file recoveries, then performs one full checkout and compile retry.
  The same total deadline covers this fallback. It can download more data for
  reorganized papers, but avoids failing just because TeX reports one missing
  input at a time.

Structured logs include `queueWaitMs`, total `durationMs`, `compileMs`, status,
cache reuse, and `nodeRssBytes`. The latter measures the Node process, **not**
the TeX subprocesses or total machine memory; use Fly machine metrics for sizing.
`/health` also reports both queue sizes. Keep Fly's request concurrency settings
separate from these worker limits: Git and thumbnail requests also count toward
Fly's scaling thresholds.

Run the lifecycle regression tests from the repository root with
`bun run test:run`. They exercise queue cancellation, deadlines, shutdown, and
real child-process termination without needing a TeX installation.

### Convex connection

After deploying, add the environment variable to Convex:

```bash
npx convex env set LATEX_SERVICE_URL https://your-latex-service.fly.dev
```

## API Usage

### POST /compile

Compile LaTeX from JSON resources:

```bash
curl -X POST https://your-service/compile \
  -H "Content-Type: application/json" \
  -d '{
    "resources": [
      {"path": "main.tex", "content": "\\documentclass{article}\\begin{document}Hello\\end{document}"}
    ],
    "target": "main.tex",
    "compiler": "pdflatex"
  }' \
  --output output.pdf
```

### GET /health

Health check endpoint.

## Supported Compilers

- `pdflatex` (default)
- `xelatex`
- `lualatex`
