**iOS improvements — 12 September 2026**

This implements the main accessibility, account, offline, and reliability findings from the [initial review](../ios-review-2026-09-12.md). The changes are local and require a coordinated release of the backend, website, and iOS app.

- The app and test targets now use Swift 6 with complete concurrency checking. Convex Swift is updated from 0.7.0 to 0.8.1. The deployment minimum remains iOS 26.2. The SDK boundary uses `@preconcurrency import` because Convex's client reference types do not declare Sendable; app access is confined to MainActor and authentication operations are serialized.
- Onboarding and sign-in grow and scroll at large text sizes. Provider labels wrap fully. The gallery uses a single column at accessibility sizes. Papers, repositories, and settings sections share the same glass card material, corner radius, subtle outline, and background. Native glass button styles are used across the app, with the original compact settings control retained in repository cards. Repository cards retain their original compact layout and show sync status as a colored dot. Toasts use adaptive foreground colors and announce messages to accessibility services. Key transitions honor Reduce Motion.
- Settings includes account deletion with confirmation and a privacy-policy link. Paper deletion also requires confirmation. Empty libraries and repository lists have an Add Repository link to the existing web flow.
- The library index persists per account, including dates and build status, so cached PDFs can be found after restarting offline. Signing out clears local documents and the account's index, and cache generations reject downloads that complete after clearing.
- PDF downloads have a streaming size limit and are validated before being cached. Invalid existing cache entries are removed; Retry invalidates the cached file. The reader adds PDFKit's native search, including Command-F, and a selectable build-details sheet.
- One-shot queries have a 15-second deadline and release subscriptions when cancelled. Live subscriptions run within the SwiftUI view task and retry after failure. Token refresh coalesces concurrent attempts, and sign-out prevents a late refresh from restoring the account. Pending remote revocations are retained in the device Keychain for retry after reconnecting.

**New mobile sign-in**

The iOS app creates a random PKCE verifier and state. The browser receives only the challenge and state. After web authentication, `/api/mobile/code` issues a code valid for two minutes. The app validates the callback's scheme, host, path, and state, then redeems the code once using its verifier at `/api/mobile/token`.

New sessions use 15-minute RS256 access tokens and rotating refresh tokens, with an absolute 90-day session lifetime. Replay of a consumed refresh token revokes the session. Normal authenticated backend queries check the session record, so revocation also invalidates access tokens. Sign-out removes push registrations for that session's device; a delayed sign-out cannot remove a newer sign-in's registration. Account deletion revokes sessions immediately and schedules bounded cleanup of rotation history.

Compatibility: older iOS/Android authentication paths remain available. Existing legacy access tokens keep their previous lifetime and revocation limitations. Signing in again with the updated iOS app creates a new session; this change does not retroactively secure all previously issued credentials. A separate retirement/migration plan is still needed for legacy mobile authentication.

**Validation**

- Xcode 26.3 / iOS 26.2 simulator: 13 Swift Testing regressions pass in Swift 6 mode. They cover callback binding, random request secrets, metadata persistence across a new store instance, account isolation, cache validation and eviction, immediate query results, query timeouts, and cancellation.
- Physical-device Release configuration: build passes with signing disabled. No app-source compiler or concurrency diagnostics were emitted. Xcode emits its standard skipped AppIntents metadata extraction warning because the app has no AppIntents dependency.
- Backend: 13 session tests cover proof-key validation, code expiry/reuse, refresh rotation/replay, revocation on real query handlers, account isolation, legacy credential escalation prevention, device unregister behavior, account deletion, and the HTTP handshake with cryptographic JWT signature verification.
- Website: seven sign-in request tests cover round-trip parameters, malformed/partial secure requests, and older-client compatibility. Production frontend build passes.
- Repository checks: `bun run check` passes, including ESLint, the TypeScript regression check, and all 84 tests across 13 files. The strict TypeScript check still reports 108 existing signatures; four resolved entries were removed from the baseline. The baseline was not expanded.
- One existing compiler subprocess test exceeded its five-second deadline while the release build was running. With the build finished, the full check passed without changing tests or timeouts.
- A new iOS GitHub Actions workflow builds and tests on Apple Silicon with Xcode 26.6. The workflow is added locally and has not run on GitHub yet.

Simulator screenshots: [large-text onboarding](onboarding-largest-text.png), [large-text sign-in](login-largest-text.png), [dark sign-in](login-dark.png). At the largest text setting, the screens scroll to reveal remaining content; buttons retain complete provider names. Simulator appearance and text size were restored afterward.

The shared paper-card styling was checked with the production card view in an isolated simulator preview using illustrative paper data: [light appearance](paper-card-shared-style-light.png), [dark appearance](paper-card-shared-style-dark.png).

Live GitHub/GitLab/email sign-in, authenticated repository synchronization, APNs delivery, and real-device accessibility testing remain release checks. The automated HTTP tests use Convex's test runtime, not a production account. This work does not claim full App Store accessibility conformance or complete parity with every optional iOS capability.

**Release order**

1. Deploy the backend schema and functions using the repository's checked deployment flow.
2. Deploy the website containing the challenge/state-preserving mobile-auth route. Verify its configured SITE_URL/ALLOWED_ORIGINS permit the website to call the new endpoints.
3. Exercise all three sign-in providers against that deployment, including refresh, logout, deletion on a disposable test account, and reopening downloaded papers offline.
4. Distribute the new iOS build only after those services are available. It intentionally rejects old callbacks containing reusable tokens, so shipping it before the website/backend will break new sign-ins.

References: [Apple's larger-text criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria), [Convex Swift 0.8.1](https://github.com/get-convex/convex-swift/releases/tag/0.8.1), [Convex's test runtime](https://docs.convex.dev/testing/convex-test), [GitHub macOS runner images](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).
