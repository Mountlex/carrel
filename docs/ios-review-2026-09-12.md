**Carrel iOS review — 12 September 2026**

This records the app before the improvement pass. See the [implemented changes and validation](ios-improvements/README.md) for the current state.

Carrel has a modern native foundation, but it is not fully current or consistently aligned with platform guidance. The highest-value work is fixing accessibility, account controls, authentication lifecycle, and offline reliability. A framework rewrite is unnecessary.

This review covers the checked-out iOS source, project configuration, relevant mobile authentication backend, and local simulator builds. Visual inspection covered onboarding and sign-in on an iPhone 17 Pro simulator running iOS 26.2, at normal and large accessibility text sizes. Authenticated screens were assessed from source; live account creation, repository synchronization, push delivery, and PDF reading were not exercised with a signed-in account. Existing unrelated working-tree changes were left in place.

| Area | Current implementation | Assessment |
| --- | --- | --- |
| UI | SwiftUI, NavigationStack, system search, sheets, SF Symbols, Liquid Glass | Modern APIs; material usage and accessible layouts need work |
| State | Observation, @Observable, @State, @Bindable; Combine for Convex | Appropriate; Combine is still useful for the SDK's publisher interface |
| Concurrency | async/await, actors for caches/Keychain, MainActor view models, approachable concurrency | Modern foundation; complete checking reports 25 distinct warning locations |
| Toolchain | Project created with Xcode 26.2; installed Xcode 26.3 | Behind current stable Xcode 26.6; Xcode 27 is a release candidate |
| OS support | Minimum iOS/iPadOS 26.2 | A product compatibility decision, separate from SDK currency |
| Dependency | Convex Swift 0.7.0 | Behind 0.8.1, including relevant crash and authentication fixes |
| Documents | PDFKit in UIViewRepresentable, URLSession, disk cache | Appropriate technologies; reader and recovery behavior are incomplete |
| Platform integration | Keychain, ASWebAuthenticationSession, APNs, privacy manifest | Good building blocks; important account and token lifecycle gaps remain |
| Validation | No iOS test target or repository iOS CI job found | Needs a repeatable iOS validation path |

Apple lists [Xcode 26.6 as stable and Xcode 27 RC as prerelease](https://developer.apple.com/xcode/system-requirements). Its [current upload requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) is Xcode 26 or later with an iOS 26 SDK or later. The local toolchain meets that minimum; this does not establish the configuration of a previously shipped build.

**1. High priority: large text makes sign-in providers indistinguishable.**

Reproduced in the simulator: after increasing preferred text size into the accessibility range, the GitHub and GitLab buttons both display “Sign in with…”. Onboarding's title and description also truncate heavily. Accessibility labels retain the full strings, but people using large visual text cannot identify the providers. Use layouts that wrap and grow vertically, permit scrolling, and keep the provider name visible. The fixed 42-point wordmark also does not scale with Dynamic Type.

Evidence: [LoginView.swift:17](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Auth/LoginView.swift:17), [sign-in button layout:189](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Auth/LoginView.swift:189), [OnboardingView.swift:102](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Onboarding/OnboardingView.swift:102). Compare [Apple's Larger Text evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria).

**2. High priority: account deletion and a direct privacy-policy link are missing from the iOS interface.**

Settings offers Sign Out and a Website link, but no Delete Account or Privacy Policy action. Account deletion already exists in the web frontend and backend. Expose deletion initiation from iOS and link directly to the privacy policy. Apple requires deletion initiation in apps that support account creation, including creation through a web flow, and an easily accessible privacy-policy link within the app.

Evidence: [SettingsView.swift:64](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Settings/SettingsView.swift:64), [About links:387](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Settings/SettingsView.swift:387), [existing backend deletion:1592](/Users/alexanderlindermayr/dev/carrel/convex/users.ts:1592). Sources: [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [App Review Guideline 5.1.1](https://developer.apple.com/app-store/review/guidelines/#privacy).

**3. High priority: mobile bearer tokens outlive logout, and the login handoff carries reusable credentials.**

The backend issues 90-day access JWTs with a randomly generated session-like subject. Logout revokes the refresh-token record; paper queries authenticate by extracting the user ID from the JWT and do not consult that revocation record. Consequently, a copied access token can remain usable after logout until expiry. The browser handoff also places access and refresh tokens in a custom-scheme callback URL, without an app-generated state/PKCE exchange in this handoff. Refresh tokens are reused rather than rotated.

Use short-lived access tokens backed by revocable sessions, rotate refresh tokens with replay detection, and return a single-use code bound to the initiating app request. Retain ASWebAuthenticationSession and Keychain. This is a source-based lifecycle finding; interception or replay was not tested against production.

Evidence: [token lifetime:8](/Users/alexanderlindermayr/dev/carrel/convex/mobileAuth.ts:8), [JWT subject:82](/Users/alexanderlindermayr/dev/carrel/convex/mobileAuth.ts:82), [refresh:238](/Users/alexanderlindermayr/dev/carrel/convex/http.ts:238), [revocation:277](/Users/alexanderlindermayr/dev/carrel/convex/mobileAuth.ts:277), [paper authentication:68](/Users/alexanderlindermayr/dev/carrel/convex/papers.ts:68), [callback credentials:107](/Users/alexanderlindermayr/dev/carrel/src/routes/mobile-auth.tsx:107). Standards: [OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html), [OAuth for native apps](https://www.rfc-editor.org/info/rfc8252/).

**4. High priority: update the Convex SDK for concrete reliability fixes.**

The lockfile pins 0.7.0. Version 0.8.0 changes authentication lifecycle support and converts JSON decode failures from crashes into errors; 0.8.1 fixes a crash when cancelling an already terminated subscription. These changes directly affect this app's subscriptions and custom AuthProvider. Upgrade with the necessary provider API migration and regression checks, rather than only changing the version number.

Evidence: [Package.resolved:12](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved:12), [ConvexAuthTokenProvider:7](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Network/ConvexService.swift:7), [official releases](https://github.com/get-convex/convex-swift/releases).

**5. Medium priority: offline support does not survive a fresh app launch as a usable library.**

PDF and thumbnail bytes persist, but the paper list starts empty and is populated exclusively from the realtime subscription. There is no persisted metadata index or downloaded-papers view. A user who downloads a paper, closes the app, and relaunches offline has no reliable route to those cached bytes. An expired token also routes startup back to sign-in when refresh fails. Persist an account-scoped library snapshot and make downloaded documents discoverable while offline. Distinguish a purgeable cache from an explicit retained download.

Evidence: [GalleryViewModel.swift:10](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Gallery/GalleryViewModel.swift:10), [subscription data:60](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Gallery/GalleryViewModel.swift:60), [startup expiry handling:70](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Auth/AuthManager.swift:70), [PDF cache location:51](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Cache/PDFCache.swift:51).

**6. Medium priority: Liquid Glass is overused in the content layer.**

GlassCard, GlassSection, paper cards, repository rows, status badges, and loading skeletons apply glass to content surfaces. Settings even nests custom glass controls inside glass sections. Apple reserves Liquid Glass primarily for controls and navigation above content and recommends standard materials for content differentiation. Use semantic backgrounds or standard materials for cards and grouped settings; preserve glass for navigation and selected floating controls. Prefer system glass button styles where their behavior fits.

Evidence: [GlassCard.swift:12](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Shared/Components/GlassCard.swift:12), [PaperCard.swift:63](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Gallery/PaperCard.swift:63), [SettingsView.swift:40](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Settings/SettingsView.swift:40). Source: [Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials).

**7. Medium priority: retry cannot recover from a corrupted cached PDF.**

PDFCache persists any successful HTTP response before PDFDocument validates it. If the payload is not a valid PDF, the reader displays an error, but Retry only changes a reload token. The next fetch returns the same invalid cached bytes. Validate before committing to cache, evict invalid entries, and provide a network-forced retry. Also enforce download limits while receiving data: the current 50 MB check occurs after the entire response has been loaded into memory. Document parsing occurs in a view-created Task and should be profiled for main-thread stalls on large files.

Evidence: [PDFCache.swift:92](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Cache/PDFCache.swift:92), [Retry:227](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Paper/PaperDetailView.swift:227), [PDF validation:432](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Paper/PaperDetailView.swift:432). Recovery behavior is established from source; memory and frame-time impact were not measured.

**8. Medium priority: asynchronous operations need explicit cancellation and deadlines.**

One-shot queries wrap subscriptions in checked continuations without cancellation handlers or deadlines. Cancelling the caller does not cancel that subscription or resume the continuation. The silent-notification handler awaits one of these operations before calling its completion handler and discards the returned papers. Logout also awaits remote unregister/revoke operations before clearing local state, and does not cancel an in-flight refresh task. Add bounded requests, cancellation propagation, and session-generation checks so refresh cannot restore a logged-out session. Clear local UI/session state deterministically during logout.

Evidence: [one-shot query:221](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Network/ConvexService.swift:221), [silent push:121](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Notifications/PushNotificationManager.swift:121), [logout:558](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Auth/AuthManager.swift:558). These are source-based failure paths, not timed production reproductions.

**9. Medium priority: first-use and failure flows remain incomplete.**

Both empty libraries instruct people to add repositories on the web, without an action taking them there. The app can track files in an existing repository but cannot complete repository onboarding. Provide an Add Repository flow or a direct guided handoff. Build failures usually collapse to “Sync failed”; the UI does not expose the detailed error/log needed to act on a failed compilation. Paper deletion executes immediately from the context menu without confirmation or undo, unlike repository deletion. Add a recovery-oriented error view and consistent deletion protection.

Evidence: [paper empty state:209](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Gallery/GalleryView.swift:209), [repository empty state:163](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Repositories/RepositoryListView.swift:163), [failure status:74](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Shared/Components/PaperStatusIndicator.swift:74), [paper deletion:186](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Gallery/GalleryView.swift:186).

**10. Medium priority: iOS changes have no automated regression gate.**

The Xcode project contains one application target and no tests. The repository workflow validates the web/backend/compiler service on Linux, not the iOS app. Add a macOS build job plus meaningful tests for token refresh/logout, cache recovery, offline launch, large text, and notification navigation. Keep XCTest/XCUITest for UI automation and consider Swift Testing for new model tests. The observed generic simulator build failure also needs an explicitly supported architecture configuration.

Evidence: [project targets:135](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel.xcodeproj/project.pbxproj:135), [scheme](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel.xcodeproj/xcshareddata/xcschemes/Carrel.xcscheme), [CI workflow:10](/Users/alexanderlindermayr/dev/carrel/.github/workflows/deploy.yml:10).

**11. Medium priority: complete concurrency checking exposes unsafe isolation boundaries.**

A build with `SWIFT_STRICT_CONCURRENCY=complete` passes in the existing Swift 5 language mode but reports 25 distinct source warning locations: 23 around transfer of the non-Sendable Convex client, and two where NetworkMonitor's path callback reads or mutates main-actor-isolated `debounceTask` from a Sendable closure. This is concrete migration work, not just an older version setting. Move network-monitor state changes onto its actor and resolve the SDK client isolation boundary alongside the dependency upgrade. Do not silence warnings with blanket unchecked Sendable annotations.

Evidence: [NetworkMonitor.swift:43](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Network/NetworkMonitor.swift:43), [ConvexService.swift:128](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Core/Network/ConvexService.swift:128), [concurrency build log](/private/tmp/carrel-ios-review-concurrency.log). These diagnostics identify unsafe boundaries; they are not a runtime demonstration of every possible data race.

**Modernization after the fixes**

- Move toward Swift 6 language mode after auditing strict concurrency diagnostics. `SWIFT_VERSION = 5.0` describes the language mode, not the age of the installed compiler. [Project setting:298](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel.xcodeproj/project.pbxproj:298); [Swift migration guidance](https://www.swift.org/migration/).
- Review custom animation behavior under Reduce Motion, toast announcements and contrast, the small repository-settings hit target, and gesture-based row activation with VoiceOver/keyboard input. A full accessibility audit remains outstanding. [Repository control:38](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Features/Repositories/RepositoryCard.swift:38); [toast:89](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/Shared/Components/ToastView.swift:89); [Reduce Motion API](https://developer.apple.com/documentation/swiftui/environmentvalues/accessibilityreducemotion).
- For iPad, consider an adaptive sidebar and library/detail layout. Current tabs contain independent NavigationStacks and papers open as modal sheets. This is supported, but the larger screen could serve reading and navigation better. [ContentView.swift:44](/Users/alexanderlindermayr/dev/carrel/Carrel/Carrel/App/ContentView.swift:44).
- Improve reading with document search, page navigation, outline/bookmarks, and persisted reading position. PDFKit remains an appropriate engine. Universal links, Files import, ShareLink/Transferable, and App Intents are useful candidates when they support real workflows; their absence alone is not a standards violation.
- Add string catalogs for intended supported languages and review the app icon's dark/tinted appearance. Neither requires replacing the UI architecture.
- Resolve the applicability of App Review Guideline 4.8 to the GitHub/GitLab account model. The specific-third-party-client exception may apply; absence of Sign in with Apple alone is not sufficient evidence of rejection. [Apple's login-service rules](https://developer.apple.com/app-store/review/guidelines/#login-services).

**Validation evidence and limits**

The Debug build succeeds for the Apple Silicon simulator with Xcode 26.3, iOS 26.2 SDK, `ARCHS=arm64`, and signing disabled. The generic simulator build fails while linking x86_64 because the pinned Convex XCFramework's simulator library contains arm64 only. This is not evidence that an arm64 device build fails. Logs: [successful arm64 build](/private/tmp/carrel-ios-review-arm64-build.log), [generic build failure](/private/tmp/carrel-ios-review-build.log).

The additional complete-concurrency build succeeds with the warnings described in finding 11. It is not a clean Swift 6 type check.

The built app launches successfully. Normal-size onboarding and sign-in are visually clean; large accessibility text reproduces the truncation described above. The simulator text-size changes were reversed. No application source, dependency version, or project build setting was changed during the review. This report does not certify App Store metadata, signed release archives, real-device performance, or authenticated end-to-end behavior.
