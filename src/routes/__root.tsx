import { createRootRouteWithContext, Link, Outlet, Scripts, HeadContent, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { QueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import "../index.css";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  useUser,
  checkPendingLink,
  clearPendingLink,
  isLinkInProgress,
  getLinkReturnTo,
  clearLinkReturnTo,
} from "../hooks/useUser";
import { useTheme } from "../hooks/useTheme";
import { EmailPasswordForm } from "../components/auth/EmailPasswordForm";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GitHubIcon, GitLabIcon, UserIcon, SignOutIcon, SunIcon, MoonIcon, SystemIcon } from "../components/icons";
import { PaperCardSkeletonGrid } from "../components/ui";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Carrel" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const {
    user,
    isLoading,
    isAuthenticated,
    signInWithGitHub,
    signInWithGitLab,
    signOut,
  } = useUser();
  const { theme, cycleTheme } = useTheme();
  const routerState = useRouterState();
  const isGalleryRoute = routerState.location.pathname === "/";
  const isRepositoriesRoute = routerState.location.pathname === "/repositories";
  const isReconnectGitLabRoute = routerState.location.pathname === "/reconnect/gitlab";
  const isMobileAuthRoute = routerState.location.pathname === "/mobile-auth";
  const linkProviderToAccount = useMutation(api.users.linkProviderToAccount);
  const [isLinking, setIsLinking] = useState(() => isLinkInProgress());
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasPendingLink = isLinkInProgress() || Boolean(checkPendingLink());
  const shouldShowLinking = isLinking && !isReconnectGitLabRoute && !isMobileAuthRoute;

  // Detect link completion after OAuth redirect
  useEffect(() => {
    async function handleLinkCompletion() {
      const pendingLink = checkPendingLink();

      if (!pendingLink || !user?._id) {
        // No pending link - clear the in-progress state if set
        if (isLinkInProgress()) {
          setIsLinking(false);
          clearPendingLink();
        }
        return;
      }

      // We have a pending link intent - try to complete it
      setIsLinking(true);
      try {
        // Use the secure intent token (server validates ownership)
        const result = await linkProviderToAccount({
          intentToken: pendingLink.intentToken,
        });
        clearPendingLink();

        if (result.linked) {
          // Small delay to ensure session is committed, then redirect
          await new Promise((resolve) => setTimeout(resolve, 500));
          const returnTo = getLinkReturnTo();
          clearLinkReturnTo();
          window.location.assign(returnTo || window.location.href);
        } else {
          // Same user or other non-error case
          setIsLinking(false);
        }
      } catch (error) {
        console.error("Failed to link accounts:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setLinkError(errorMessage);
        clearPendingLink();
        clearLinkReturnTo();
        setIsLinking(false);
        // Show recovery UI for critical errors
        if (errorMessage.includes("expired") || errorMessage.includes("Invalid")) {
          previousFocusRef.current = document.activeElement as HTMLElement;
          setShowRecovery(true);
        }
      }
    }

    if (isAuthenticated && user && !isLoading) {
      handleLinkCompletion();
    }
  }, [isAuthenticated, user, isLoading, linkProviderToAccount]);

  // Timeout for linking state
  useEffect(() => {
    if (!isLinking) return;

    const timeout = setTimeout(() => {
      setIsLinking(false);
      setLinkError("Account linking timed out. Please try again.");
      clearPendingLink();
      clearLinkReturnTo();
    }, 30000);

    return () => clearTimeout(timeout);
  }, [isLinking]);

  return (
    <RootDocument>
      <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0c0c0e]">
        <header className="sticky top-0 z-50 w-full border-b border-gray-200/60 bg-white/95 backdrop-blur-md dark:border-gray-800/60 dark:bg-[#111113]/95">
          <div className="container mx-auto flex h-14 items-center px-4 md:px-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-serif text-2xl tracking-tight text-gray-900 dark:text-gray-100">Carrel</span>
            </Link>
            <nav className="ml-auto flex items-center gap-1">
              {isAuthenticated && (
                <div className="mr-2 flex items-center">
                  <Link
                    to="/"
                    className={`nav-link relative rounded-md px-3 py-1.5 text-sm transition-colors hover:text-gray-900 dark:hover:text-gray-100 ${
                      isGalleryRoute
                        ? "text-gray-900 dark:text-gray-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                    data-status={isGalleryRoute ? "active" : undefined}
                  >
                    Gallery
                  </Link>
                  <Link
                    to="/repositories"
                    className={`nav-link relative rounded-md px-3 py-1.5 text-sm transition-colors hover:text-gray-900 dark:hover:text-gray-100 ${
                      isRepositoriesRoute
                        ? "text-gray-900 dark:text-gray-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                    data-status={isRepositoriesRoute ? "active" : undefined}
                  >
                    Repositories
                  </Link>
                </div>
              )}
              {isLoading ? (
                <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
              ) : isAuthenticated ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={cycleTheme}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title={`Theme: ${theme} (click to change)`}
                    aria-label={`Current theme: ${theme}. Click to change theme`}
                  >
                    {theme === "system" ? (
                      <SystemIcon className="h-4 w-4" aria-hidden="true" />
                    ) : theme === "dark" ? (
                      <MoonIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <SunIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  <Link
                    to="/profile"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title="Profile"
                    aria-label="Go to profile"
                  >
                    <UserIcon className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <button
                    onClick={() => signOut()}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title="Sign out"
                    aria-label="Sign out of your account"
                  >
                    <SignOutIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={cycleTheme}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title={`Theme: ${theme} (click to change)`}
                    aria-label={`Current theme: ${theme}. Click to change theme`}
                  >
                    {theme === "system" ? (
                      <SystemIcon className="h-4 w-4" aria-hidden="true" />
                    ) : theme === "dark" ? (
                      <MoonIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <SunIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    onClick={() => signInWithGitHub()}
                    className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                    title="Sign in with GitHub"
                    aria-label="Sign in with GitHub"
                  >
                    <GitHubIcon className="h-4 w-4" aria-hidden="true" />
                    <span className="ml-2 hidden sm:inline">GitHub</span>
                  </button>
                  <button
                    onClick={() => signInWithGitLab()}
                    className="inline-flex items-center rounded-md bg-[#FC6D26] px-3 py-1.5 text-sm text-white transition-colors hover:bg-[#e85d1a]"
                    title="Sign in with GitLab"
                    aria-label="Sign in with GitLab"
                  >
                    <GitLabIcon className="h-4 w-4" aria-hidden="true" />
                    <span className="ml-2 hidden sm:inline">GitLab</span>
                  </button>
                </div>
              )}
            </nav>
          </div>
        </header>
        <main className="container mx-auto min-h-[calc(100vh-8rem)] px-4 py-8 md:px-6">
          {linkError && (
            <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-950">
              <p className="text-sm font-medium text-danger-800 dark:text-danger-200">Failed to link accounts</p>
              <p className="mt-1 text-sm text-danger-600 dark:text-danger-400">{linkError}</p>
              <button
                onClick={() => setLinkError(null)}
                className="mt-2 text-sm text-danger-700 underline dark:text-danger-300"
              >
                Dismiss
              </button>
            </div>
          )}
          {/* Recovery modal for failed account linking */}
          {showRecovery && (
            <div
              className="backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="recovery-modal-title"
              aria-describedby="recovery-modal-description"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowRecovery(false);
                  setLinkError(null);
                }
              }}
            >
              <div className="dialog-enter mx-4 max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <h3 id="recovery-modal-title" className="text-lg font-medium text-gray-900 dark:text-gray-100">Account Linking Failed</h3>
                <div id="recovery-modal-description">
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    The account linking session has expired or was invalid. This can happen if you took
                    more than 30 seconds to complete the OAuth flow, or if you navigated away.
                  </p>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    You can sign out and try again, or dismiss this message and continue using your
                    current account without linking.
                  </p>
                </div>
                <div className="mt-5 flex gap-3">
                  <button
                    autoFocus
                    onClick={() => {
                      setShowRecovery(false);
                      setLinkError(null);
                      previousFocusRef.current?.focus();
                      signOut();
                    }}
                    className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    Sign Out & Try Again
                  </button>
                  <button
                    onClick={() => {
                      setShowRecovery(false);
                      setLinkError(null);
                      previousFocusRef.current?.focus();
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Dismiss & Continue
                  </button>
                </div>
              </div>
            </div>
          )}
          {shouldShowLinking ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-500 dark:border-gray-700 dark:border-t-primary-400" />
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Linking accounts...</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">This should only take a few seconds. If a popup opened, please complete sign-in there.</p>
            </div>
          ) : isLoading ? (
            isGalleryRoute ? (
              <GalleryLoading />
            ) : isRepositoriesRoute ? (
              <RepositoriesLoading />
            ) : (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-500 dark:border-gray-700 dark:border-t-primary-400" />
              </div>
            )
          ) : isAuthenticated || isReconnectGitLabRoute || isMobileAuthRoute ? (
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          ) : (
            <LandingPage
              hasPendingLink={hasPendingLink}
              signInWithGitHub={signInWithGitHub}
              signInWithGitLab={signInWithGitLab}
            />
          )}
        </main>
        <footer className="border-t border-gray-200/60 bg-white/80 py-6 dark:border-gray-800/60 dark:bg-[#111113]/80">
          <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 text-sm text-gray-400 dark:text-gray-500 sm:flex-row md:px-6">
            <p>&copy; {new Date().getFullYear()} Carrel</p>
            <nav className="flex gap-6">
              <Link to="/privacy" className="transition-colors hover:text-gray-600 dark:hover:text-gray-300">
                Privacy Policy
              </Link>
            </nav>
          </div>
        </footer>
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </div>
    </RootDocument>
  );
}

function LandingPage({
  hasPendingLink,
  signInWithGitHub,
  signInWithGitLab,
}: {
  hasPendingLink: boolean;
  signInWithGitHub: () => void;
  signInWithGitLab: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 md:py-20">
      {hasPendingLink && (
        <div className="mb-8 w-full max-w-sm rounded-lg border border-warning-200 bg-warning-50 p-4 text-center dark:border-warning-800 dark:bg-warning-950">
          <p className="text-sm font-medium text-warning-900 dark:text-warning-100">
            Reconnect in progress
          </p>
          <p className="mt-1 text-sm text-warning-700 dark:text-warning-200">
            Continue with GitLab to finish reconnecting your account.
          </p>
          <Link
            to="/reconnect/gitlab"
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-[#FC6D26] px-4 py-2 text-sm text-white transition-colors hover:bg-[#e85d1a]"
          >
            Continue with GitLab
          </Link>
        </div>
      )}

      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="font-serif text-4xl tracking-tight text-gray-900 dark:text-gray-100 md:text-5xl">
          Carrel
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-gray-500 dark:text-gray-400">
          A reading room for your LaTeX papers.
          <br className="hidden sm:block" />
          Preview and share from GitHub, GitLab, or Overleaf.
        </p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-gray-200/80 bg-white p-6 shadow-sm dark:border-gray-800/80 dark:bg-gray-900/80">
          {/* Email/Password Form */}
          <EmailPasswordForm />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-gray-400 dark:bg-gray-900 dark:text-gray-500">or continue with</span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => signInWithGitHub()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              <GitHubIcon className="h-4 w-4" />
              GitHub
            </button>
            <button
              onClick={() => signInWithGitLab()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FC6D26] px-4 py-2.5 text-sm text-white transition-colors hover:bg-[#e85d1a]"
            >
              <GitLabIcon className="h-4 w-4" />
              GitLab
            </button>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="mt-16 grid max-w-2xl grid-cols-1 gap-6 px-4 sm:grid-cols-3">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Live Preview</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            See your compiled PDFs update automatically with each push.
          </p>
        </div>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Share Easily</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Generate public links for collaborators and reviewers.
          </p>
        </div>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Multi-Provider</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Works with GitHub, GitLab, Overleaf, and self-hosted instances.
          </p>
        </div>
      </div>
    </div>
  );
}

function GalleryLoading() {
  return (
    <div>
      <div className="mb-6 md:mb-8">
        <div className="flex items-center justify-between">
          <div className="h-7 w-40 rounded-md bg-gray-200 dark:bg-gray-800" />
          <div className="flex items-center gap-2">
            <div className="hidden h-9 w-56 rounded-md bg-gray-200 dark:bg-gray-800 md:block" />
            <div className="hidden h-9 w-28 rounded-md bg-gray-200 dark:bg-gray-800 md:block" />
            <div className="hidden h-9 w-28 rounded-md bg-gray-200 dark:bg-gray-800 md:block" />
            <div className="hidden h-9 w-32 rounded-md bg-gray-200 dark:bg-gray-800 md:block" />
          </div>
        </div>
      </div>
      <PaperCardSkeletonGrid count={8} />
    </div>
  );
}

function RepositoriesLoading() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 md:mb-8">
        <div className="h-7 w-36 rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-md bg-gray-200 dark:bg-gray-800" />
          <div className="h-9 w-36 rounded-md bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`repo-skeleton-${index}`}
            className="rounded-xl border border-gray-200/60 bg-white p-5 shadow-sm dark:border-gray-800/60 dark:bg-gray-900"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="h-11 w-11 rounded-lg bg-gray-200 dark:bg-gray-800" />
                <div className="min-w-0 flex-1">
                  <div className="h-5 w-40 rounded-md bg-gray-200 dark:bg-gray-800" />
                  <div className="mt-2 h-4 w-64 rounded-md bg-gray-100 dark:bg-gray-850" />
                </div>
              </div>
              <div className="hidden shrink-0 items-center gap-6 lg:flex">
                <div className="flex w-14 flex-col items-center">
                  <div className="h-6 w-10 rounded-md bg-gray-200 dark:bg-gray-800" />
                  <div className="mt-2 h-3 w-12 rounded-md bg-gray-100 dark:bg-gray-850" />
                </div>
                <div className="flex w-[115px] flex-col items-center">
                  <div className="h-5 w-20 rounded-md bg-gray-200 dark:bg-gray-800" />
                  <div className="mt-2 h-3 w-24 rounded-md bg-gray-100 dark:bg-gray-850" />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800 lg:border-l lg:border-t-0 lg:py-1 lg:pl-8 lg:pt-0">
                <div className="h-9 w-28 rounded-md bg-gray-200 dark:bg-gray-800" />
                <div className="h-9 w-9 rounded-md bg-gray-200 dark:bg-gray-800" />
                <div className="h-9 w-9 rounded-md bg-gray-200 dark:bg-gray-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('carrel_theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-[#faf9f7] dark:bg-[#0c0c0e]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
