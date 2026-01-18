# Carrel

A web app to preview and share PDFs from your LaTeX projects. Supports GitHub, GitLab, Overleaf, and self-hosted GitLab.

## Features

- Connect repositories from multiple Git providers
- Track PDFs from commits, CI artifacts, releases, or compile LaTeX on-demand
- Pinterest-style gallery with public sharing links
- Smart caching - only re-fetches when commits change

## Quick Start

```bash
# Install dependencies
bun install

# Start development (frontend + backend)
bun run dev:all
```

Requires [Bun](https://bun.sh) and a [Convex](https://convex.dev) account.

## Environment Setup

Set these in your Convex dashboard:

| Variable | Description |
|----------|-------------|
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth credentials |
| `AUTH_GITLAB_ID` / `AUTH_GITLAB_SECRET` | GitLab OAuth credentials |
| `AUTH_RESEND_KEY` | Resend API key for email auth |
| `JWT_PRIVATE_KEY` / `JWKS` | JWT signing keys |
| `SITE_URL` | Your app URL |
| `LATEX_SERVICE_URL` | Optional LaTeX compilation service |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start frontend only |
| `bun run dev:convex` | Start backend only |
| `bun run dev:all` | Start both |
| `bun run build` | Production build |
| `bun run lint` | Run ESLint |

## Deployment

Push a version tag to trigger the GitHub Actions workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This deploys Convex, Cloudflare Workers, and the LaTeX service (if changed).

## License

MIT
