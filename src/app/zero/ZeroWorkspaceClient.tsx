"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  useConnectionState,
  useQuery,
  useZero,
  ZeroProvider,
} from "@rocicorp/zero/react";
import { registerZeroLogoutCleanup } from "@/zero/logout";
import { zeroMutators } from "@/zero/mutators";
import { zeroQueries } from "@/zero/queries";
import { zeroSchema } from "@/zero/schema";
import {
  DEFAULT_WORKFLOW_STATES,
  workspaceSlug,
} from "@/zero/stage3";
import Stage3Workspace from "@/components/zero/Stage3Workspace";

type ZeroWorkspaceClientProps = {
  cacheURL: string;
  displayName: string;
  userID: string;
};

export default function ZeroWorkspaceClient({
  cacheURL,
  displayName,
  userID,
}: ZeroWorkspaceClientProps) {
  return (
    <ZeroProvider
      cacheURL={cacheURL}
      context={{ userID }}
      mutators={zeroMutators}
      schema={zeroSchema}
      storageKey="pulsar-zero-stage3"
      userID={userID}
    >
      <Stage3App displayName={displayName} userID={userID} />
    </ZeroProvider>
  );
}

function Stage3App({
  displayName,
  userID,
}: {
  displayName: string;
  userID: string;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const [workspaces, result] = useQuery(zeroQueries.workspaces.mine());
  const [selectedWorkspaceID, setSelectedWorkspaceID] = useState<string | null>(
    null
  );

  useEffect(
    () => registerZeroLogoutCleanup(() => zero.delete().then(() => undefined)),
    [zero]
  );

  const effectiveWorkspaceID = workspaces.some(
    (workspace) => workspace.id === selectedWorkspaceID
  )
    ? selectedWorkspaceID
    : (workspaces[0]?.id ?? null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === effectiveWorkspaceID) ??
      null,
    [effectiveWorkspaceID, workspaces]
  );

  return (
    <section className="mx-auto min-h-[70vh] max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/70">
            PULSAR-9 · Zero product slice
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white">
            Products and issues
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workspaces.length > 1 ? (
            <select
              aria-label="Workspace"
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
              onChange={(event) => setSelectedWorkspaceID(event.target.value)}
              value={effectiveWorkspaceID ?? ""}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          ) : null}
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              connection.name === "connected"
                ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-200"
                : connection.name === "needs-auth" ||
                    connection.name === "error"
                  ? "border-red-400/20 bg-red-400/8 text-red-200"
                  : "border-amber-300/20 bg-amber-300/8 text-amber-100"
            }`}
          >
            Zero: {connection.name}
          </span>
        </div>
      </header>

      {result.type === "unknown" ? (
        <LoadingPanel label="Syncing your workspaces…" />
      ) : result.type === "error" ? (
        <ErrorPanel
          message={result.error.message}
          onRetry={() => result.retry()}
        />
      ) : selectedWorkspace ? (
        <Stage3Workspace
          key={selectedWorkspace.id}
          userID={userID}
          workspace={selectedWorkspace}
        />
      ) : (
        <CreateWorkspace
          displayName={displayName}
          userID={userID}
        />
      )}
    </section>
  );
}

function CreateWorkspace({
  displayName,
  userID,
}: {
  displayName: string;
  userID: string;
}) {
  const zero = useZero();
  const [name, setName] = useState(`${displayName}'s Workspace`);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;

    setSubmitting(true);
    setError(null);
    try {
      const mutation = zero.mutate(
        zeroMutators.workspaces.create({
          id: crypto.randomUUID(),
          name: nextName,
          slug: workspaceSlug(nextName, userID),
          displayName,
          workflowID: crypto.randomUUID(),
          workflowName: "Default workflow",
          workflowStates: DEFAULT_WORKFLOW_STATES.map((state) => ({
            ...state,
            id: crypto.randomUUID(),
          })),
        })
      );
      const optimistic = await mutation.client;
      if (optimistic.type === "error") {
        throw new Error(optimistic.error.message);
      }
      const authoritative = await mutation.server;
      if (authoritative.type === "error") {
        throw new Error(authoritative.error.message);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create workspace"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-[56vh] place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border border-white/8 bg-slate-950/70 p-5"
        onSubmit={submit}
      >
        <div>
          <h2 className="text-lg font-semibold text-white">
            Create your Zero workspace
          </h2>
          <p className="mt-1 text-sm text-white/55">
            The default workflow and its states are created atomically.
          </p>
        </div>
        <input
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button
          className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
          disabled={submitting || !name.trim()}
          type="submit"
        >
          {submitting ? "Creating…" : "Create workspace"}
        </button>
      </form>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="grid min-h-[45vh] place-items-center rounded-2xl border border-white/8 bg-white/[0.015] text-sm text-white/55">
      {label}
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid min-h-[45vh] place-items-center rounded-2xl border border-red-400/15 bg-red-400/5 p-6 text-center">
      <div>
        <p className="text-sm text-red-200">{message}</p>
        <button
          className="mt-3 rounded-lg border border-red-300/20 px-3 py-2 text-sm text-red-100"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
