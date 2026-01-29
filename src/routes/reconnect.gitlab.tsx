import { useMemo, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { checkPendingLink, getLinkReturnTo } from "../hooks/useUser";
import { GitLabIcon } from "../components/icons";

export const Route = createFileRoute("/reconnect/gitlab")({
  component: ReconnectGitLabPage,
});

function ReconnectGitLabPage() {
  const navigate = useNavigate();
  const { signIn, signOut } = useAuthActions();
  const [isStarting, setIsStarting] = useState(false);
  const pendingLink = useMemo(() => checkPendingLink(), []);
  const returnTo = useMemo(() => getLinkReturnTo(), []);

  const handleContinue = () => {
    if (isStarting) return;
    setIsStarting(true);
    signOut();
    const redirectTo = returnTo ?? `${window.location.origin}/reconnect/gitlab`;
    signIn("gitlab", { redirectTo });
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FC6D26]">
            <GitLabIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-normal text-gray-900 dark:text-gray-100">Reconnect GitLab</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Finish linking your GitLab account.</p>
          </div>
        </div>

        {pendingLink ? (
          <div className="mt-5">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Click continue to open GitLab and complete reconnection.
            </p>
            <button
              onClick={handleContinue}
              disabled={isStarting}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[#FC6D26] px-4 py-2 text-sm font-normal text-white hover:bg-[#E24329] disabled:opacity-60"
            >
              {isStarting ? "Opening GitLab..." : "Continue with GitLab"}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No reconnect request is in progress. You can return to your profile to connect GitLab again.
            </p>
            <button
              onClick={() => navigate({ to: "/profile" })}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Go to Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
