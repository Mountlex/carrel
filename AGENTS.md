# Repository Guidelines

## Project Structure & Module Organization

- `src/` holds the React + TanStack Router frontend. Route files live in `src/routes/` (file-based routing), and `src/routeTree.gen.ts` is auto-generated.
- `convex/` contains the Convex backend functions, schema, and auth config.
- `latex-service/` is an optional Dockerized microservice for LaTeX compilation and thumbnails.
- `public/` and `src/assets/` store static assets, while `src/index.css` defines global styles.

## Build, Test, and Development Commands

- `bun run dev` starts the Vite frontend on port 5173.
- `bun run dev:convex` runs the Convex dev server and generates types.
- `bun run dev:all` runs both frontend and backend concurrently.
- `bun run build` builds the Vite app; it does not type-check sources.
- `bun run check` runs lint, TypeScript regression checks, and tests. Install the service dependencies with `npm ci --omit=dev --prefix latex-service` first.
- `bun run typecheck:strict` reports all TypeScript errors. `bun run typecheck` checks the actual referenced projects against the documented existing-error baseline; it must not be described as a clean strict type check.
- `bun run lint` runs ESLint across the repo.
- Use `bun run deploy:backend`, `bun run deploy:frontend`, or `bun run deploy:latex` for checked deployments.

## Coding Style & Naming Conventions

- TypeScript + React with Vite; keep files as `.ts`/`.tsx`.
- Follow existing formatting and ESLint rules from `eslint.config.js` (no standalone formatter configured).
- Use file-based route naming in `src/routes/` (e.g., `papers.$id.tsx`).
- Keep Convex modules focused by domain (e.g., `convex/papers.ts`, `convex/repositories.ts`).

## Testing Guidelines

- Run `bun run test` to run tests in watch mode, or `bun run test:run` for a single run. Tests use vitest.
- Run `bun run check` before deploying. Do not use plain `tsc --noEmit` on the root solution config as evidence of type safety: its `files` array is empty.
- Add regressions for compilation incidents. The default LaTeX Docker build runs real engine/PDF/thumbnail tests; do not deploy an intermediate Docker target to bypass them.
- Do not expand `scripts/typecheck-baseline.json` to make new code pass. Remove resolved entries as type debt is fixed. See `docs/compilation-reliability.md`.
- Validate changes by running `bun run dev:all` and exercising key flows: auth, repo sync, and paper viewing.

## Commit & Pull Request Guidelines

- Git history only includes the initial commit, so there is no established convention yet.
- Use concise, imperative commit summaries and include a short description in PRs.
- For UI changes, include screenshots or a short screen recording.
- Link related issues or describe the user-facing impact when applicable.

## Configuration & Security Notes

- Required env values live in Convex dashboard (e.g., `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`).
- `VITE_CONVEX_URL` is written to `.env.local` by `npx convex dev`.
- If using the LaTeX service, set `LATEX_SERVICE_URL` and ensure the service is running.
