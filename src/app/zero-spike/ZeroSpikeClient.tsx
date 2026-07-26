"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  useConnectionState,
  useQuery,
  useZero,
  ZeroProvider,
} from "@rocicorp/zero/react";
import { zeroMutators } from "@/zero/mutators";
import { zeroQueries } from "@/zero/queries";
import { zeroSchema } from "@/zero/schema";
import { registerZeroLogoutCleanup } from "@/zero/logout";

type ZeroSpikeClientProps = {
  cacheURL: string;
  userID: string;
};

export default function ZeroSpikeClient({
  cacheURL,
  userID,
}: ZeroSpikeClientProps) {
  return (
    <ZeroProvider
      cacheURL={cacheURL}
      context={{ userID }}
      mutators={zeroMutators}
      schema={zeroSchema}
      storageKey="pulsar-zero-spike"
      userID={userID}
    >
      <ZeroSpikeContent />
    </ZeroProvider>
  );
}

function ZeroSpikeContent() {
  const zero = useZero();
  const connection = useConnectionState();
  const [issues] = useQuery(zeroQueries.issues.mine());
  const [title, setTitle] = useState("");

  useEffect(
    () => registerZeroLogoutCleanup(() => zero.delete().then(() => undefined)),
    [zero]
  );

  const createIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setTitle("");
    await zero.mutate(
      zeroMutators.issues.create({
        id: crypto.randomUUID(),
        title: nextTitle,
      })
    );
  };

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          PULSAR-6
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Zero vertical spike</h1>
        <p className="mt-2 text-sm text-slate-400">
          Connection: <span className="text-slate-200">{connection.name}</span>.
          Open this page in two tabs to verify realtime propagation.
        </p>
      </header>

      <form className="flex gap-3" onSubmit={createIssue}>
        <input
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-400"
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Create an optimistic issue"
          value={title}
        />
        <button
          className="rounded-lg bg-blue-500 px-5 py-3 font-medium text-white hover:bg-blue-400"
          type="submit"
        >
          Create
        </button>
      </form>

      <div className="space-y-2">
        {issues.map((issue) => (
          <label
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
            key={issue.id}
          >
            <input
              checked={issue.done}
              onChange={(event) => {
                void zero.mutate(
                  zeroMutators.issues.setDone({
                    id: issue.id,
                    done: event.target.checked,
                  })
                );
              }}
              type="checkbox"
            />
            <span className={issue.done ? "text-slate-500 line-through" : ""}>
              {issue.title}
            </span>
          </label>
        ))}
        {issues.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
            No spike issues for this user yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
