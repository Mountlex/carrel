# Compilation reliability checks

## Before a release

Use Node 22 and Bun 1.3.8, matching CI. Install with:

```sh
bun install --frozen-lockfile
npm ci --omit=dev --prefix latex-service
bun run check
bun run build
```

`check` includes the TypeScript frontend/backend and ESLint checks for the
CommonJS compiler service. Tests cover missing-file recovery, mobile PDF and
dependency saving, client-visible errors, notification size, log retention,
queue expiry, cancellation, and subprocess termination.

The default Docker build also exercises the real production tools. It compiles
a small paper, adds seven inputs and a bibliography after its dependencies are
cached, then verifies the updated PDF text, bibliography, all three supported
engines, and thumbnails. A failed smoke test fails the Docker build. This is
also enforced when building remotely with Fly, independently of GitHub Actions.
The final image excludes test fixtures and test-generated font caches.

GitHub Actions runs the checks and image build for pull requests, main pushes,
and release tags. All release jobs depend on the check job. Workflow changes
only become active after they are committed and pushed to GitHub.

Use the checked `deploy:backend`, `deploy:frontend`, and `deploy:latex` package
scripts for manual deployment. Avoid intermediate Docker targets and direct
provider commands that bypass these checks. Build-only validation on Fly is:

```sh
cd latex-service
flyctl deploy --build-only --remote-only
```

## TypeScript backlog

The old CI command, `tsc --noEmit`, checked the root solution configuration,
which has an empty `files` list. It did not check either referenced project.

`bun run typecheck` now uses TypeScript's compiler API to check both projects.
Existing errors are recorded in `scripts/typecheck-baseline.json`; the gate
rejects added or changed diagnostic signatures and stale baseline entries.
Signatures include the file, error code, message, offending source line, and
count. Line numbers are excluded so unrelated edits do not invalidate them.
This is a regression gate, **not a clean strict type check**. It also does not
prove the correctness of code already affected by the recorded type errors.

`bun run typecheck:strict` reports the full backlog and exits nonzero while it
exists. Fix and remove these entries incrementally. Do not regenerate the
baseline simply to accept new errors. The `--record-baseline` maintenance
option writes current diagnostics; any such diff requires review to ensure
only resolved/reclassified existing debt is recorded, not new failures.

## After a compilation incident

1. Match the client request ID with Convex logs and the service's compilation
   logs. Distinguish authentication failures, missing source files, compiler
   errors, and infrastructure timeouts.
2. Turn the failure into a disposable local regression fixture. Include stale
   cached dependencies and directory layouts when relevant.
3. Run code checks and the default production image build before deployment.
4. Rebuild the affected paper and confirm its PDF, thumbnail, dependencies,
   and cleared error status in production. A health endpoint alone is not
   evidence that a real paper compiles.

Source errors, revoked provider credentials, and external outages can still
cause builds to fail. Keep the useful end of the build log and short client
errors so those failures are diagnosable; keep full logs out of push payloads.
No recurring monitoring or automatic customer-paper builds are configured by
these checks.
