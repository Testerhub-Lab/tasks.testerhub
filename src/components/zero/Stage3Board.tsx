"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { waitForZeroMutation } from "@/zero/client";
import { zeroMutators } from "@/zero/mutators";
import { zeroQueries } from "@/zero/queries";
import type {
  IssuePriority,
  WorkspaceRole,
  WorkflowCategory,
} from "@/zero/schema";
import { issueKey, rankAfter } from "@/zero/stage3";

type ProjectRow = {
  id: string;
  key: string;
  name: string;
  workflowID: string;
};

type WorkflowStateOption = {
  id: string;
  name: string;
  category: WorkflowCategory;
  color?: string | null;
  rank: string;
};

type Stage3BoardProps = {
  project: ProjectRow;
  role: WorkspaceRole | null;
};

const priorities: readonly IssuePriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export default function Stage3Board({ project, role }: Stage3BoardProps) {
  const zero = useZero();
  const [states, statesResult] = useQuery(
    zeroQueries.workflowStates.byWorkflow({ workflowID: project.workflowID })
  );
  const [issues, issuesResult] = useQuery(
    zeroQueries.issues.byProject({ projectID: project.id })
  );
  const [selectedIssueID, setSelectedIssueID] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const canWrite =
    role === "OWNER" || role === "ADMIN" || role === "MEMBER";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } })
  );

  const issuesByState = useMemo(() => {
    const grouped = new Map<string, typeof issues>();
    for (const state of states) grouped.set(state.id, []);
    for (const issue of issues) {
      grouped.set(issue.stateID, [
        ...(grouped.get(issue.stateID) ?? []),
        issue,
      ]);
    }
    return grouped;
  }, [issues, states]);

  const moveIssue = async (event: DragEndEvent) => {
    const issueID = String(event.active.id).replace(/^issue:/, "");
    const stateID = event.over
      ? String(event.over.id).replace(/^state:/, "")
      : null;
    if (!stateID || !canWrite) return;

    const issue = issues.find((candidate) => candidate.id === issueID);
    const state = states.find((candidate) => candidate.id === stateID);
    if (!issue || !state || issue.stateID === stateID) return;

    const targetRanks = (issuesByState.get(stateID) ?? []).map(
      (candidate) => candidate.rank
    );
    setMutationError(null);
    try {
      await waitForZeroMutation(
        zero.mutate(
          zeroMutators.issues.update({
            id: issue.id,
            stateID,
            rank: rankAfter(targetRanks),
          })
        )
      );
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Unable to move issue"
      );
    }
  };

  const queryError = [statesResult, issuesResult].find(
    (result) => result.type === "error"
  );

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-white/7 px-1.5 py-0.5 text-[10px] font-semibold text-white/50">
              {project.key}
            </span>
            <h2 className="text-lg font-semibold text-white">{project.name}</h2>
          </div>
          <p className="mt-1 text-xs text-white/40">
            {issues.length} {issues.length === 1 ? "issue" : "issues"} · live
            via Zero
          </p>
        </div>
        {canWrite ? (
          <button
            className="rounded-lg bg-cyan-500 px-3.5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            onClick={() => setShowCreate((value) => !value)}
            type="button"
          >
            {showCreate ? "Cancel" : "+ Issue"}
          </button>
        ) : (
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/45">
            Read only
          </span>
        )}
      </header>

      {showCreate ? (
        <CreateIssueForm
          issues={issues}
          onCreated={(issueID) => {
            setSelectedIssueID(issueID);
            setShowCreate(false);
          }}
          projectID={project.id}
          states={states}
        />
      ) : null}

      {mutationError ? (
        <div className="rounded-lg border border-red-400/20 bg-red-400/7 px-3 py-2 text-sm text-red-200">
          Mutation rejected and rolled back: {mutationError}
        </div>
      ) : null}

      {statesResult.type === "unknown" || issuesResult.type === "unknown" ? (
        <BoardMessage>Syncing board…</BoardMessage>
      ) : queryError?.type === "error" ? (
        <BoardMessage tone="error">{queryError.error.message}</BoardMessage>
      ) : states.length === 0 ? (
        <BoardMessage>The workflow has no active states.</BoardMessage>
      ) : (
        <DndContext sensors={sensors} onDragEnd={(event) => void moveIssue(event)}>
          <div
            className="grid min-w-0 gap-3 overflow-x-auto pb-2"
            style={{
              gridTemplateColumns: `repeat(${states.length}, minmax(250px, 1fr))`,
            }}
          >
            {states.map((state) => (
              <StateColumn
                count={issuesByState.get(state.id)?.length ?? 0}
                key={state.id}
                state={state}
              >
                {(issuesByState.get(state.id) ?? []).map((issue) => (
                  <DraggableIssueCard
                    canWrite={canWrite}
                    issue={{
                      id: issue.id,
                      number: issue.number,
                      priority: issue.priority,
                      title: issue.title,
                    }}
                    key={issue.id}
                    onOpen={() => setSelectedIssueID(issue.id)}
                    projectKey={project.key}
                  />
                ))}
              </StateColumn>
            ))}
          </div>
        </DndContext>
      )}

      {selectedIssueID ? (
        <IssuePanel
          canWrite={canWrite}
          issueID={selectedIssueID}
          onClose={() => setSelectedIssueID(null)}
          projectKey={project.key}
          states={states}
        />
      ) : null}
    </section>
  );
}

function CreateIssueForm({
  issues,
  onCreated,
  projectID,
  states,
}: {
  issues: readonly { rank: string; stateID: string }[];
  onCreated: (issueID: string) => void;
  projectID: string;
  states: readonly WorkflowStateOption[];
}) {
  const zero = useZero();
  const defaultState =
    states.find((state) => state.category === "UNSTARTED") ?? states[0] ?? null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("MEDIUM");
  const [stateID, setStateID] = useState(defaultState?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || !stateID) return;

    const issueID = crypto.randomUUID();
    setSubmitting(true);
    setError(null);
    try {
      await waitForZeroMutation(
        zero.mutate(
          zeroMutators.issues.create({
            id: issueID,
            projectID,
            stateID,
            title: nextTitle,
            description: description.trim() || null,
            priority,
            rank: rankAfter(
              issues
                .filter((issue) => issue.stateID === stateID)
                .map((issue) => issue.rank)
            ),
          })
        )
      );
      onCreated(issueID);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create issue"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="grid gap-3 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4 md:grid-cols-[minmax(0,2fr)_180px_150px_auto]"
      onSubmit={submit}
    >
      <div className="space-y-2">
        <input
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40"
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Issue title"
          value={title}
        />
        <input
          className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/80 outline-none focus:border-cyan-300/40"
          maxLength={20000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short description (optional)"
          value={description}
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
      <select
        className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none"
        onChange={(event) => setStateID(event.target.value)}
        value={stateID}
      >
        {states.map((state) => (
          <option key={state.id} value={state.id}>
            {state.name}
          </option>
        ))}
      </select>
      <select
        className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none"
        onChange={(event) => setPriority(event.target.value as IssuePriority)}
        value={priority}
      >
        {priorities.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <button
        className="h-10 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
        disabled={submitting || !title.trim() || !stateID}
        type="submit"
      >
        {submitting ? "Creating…" : "Create"}
      </button>
    </form>
  );
}

function StateColumn({
  children,
  count,
  state,
}: {
  children: React.ReactNode;
  count: number;
  state: WorkflowStateOption;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `state:${state.id}` });

  return (
    <div
      className={`min-h-[480px] rounded-2xl border p-2.5 transition ${
        isOver
          ? "border-cyan-300/35 bg-cyan-300/[0.055]"
          : "border-white/8 bg-white/[0.018]"
      }`}
      ref={setNodeRef}
    >
      <div className="mb-2 flex items-center justify-between px-1 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: state.color ?? "#64748b" }}
          />
          <h3 className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-white/65">
            {state.name}
          </h3>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DraggableIssueCard({
  canWrite,
  issue,
  onOpen,
  projectKey,
}: {
  canWrite: boolean;
  issue: {
    id: string;
    number: number;
    priority: IssuePriority;
    title: string;
  };
  onOpen: () => void;
  projectKey: string;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
  } = useDraggable({
    id: `issue:${issue.id}`,
    disabled: !canWrite,
  });

  return (
    <article
      className={`rounded-xl border border-white/8 bg-slate-950/65 p-3 shadow-sm transition hover:border-white/15 ${
        isDragging ? "z-20 opacity-55" : ""
      }`}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      <button
        className="block w-full text-left"
        onClick={(event) => {
          event.stopPropagation();
          if (!isDragging) onOpen();
        }}
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            {issueKey(projectKey, issue.number)}
          </span>
          <PriorityDot value={issue.priority} />
        </div>
        <p className="mt-2 line-clamp-3 text-sm leading-5 text-white/85">
          {issue.title}
        </p>
      </button>
    </article>
  );
}

function IssuePanel({
  canWrite,
  issueID,
  onClose,
  projectKey,
  states,
}: {
  canWrite: boolean;
  issueID: string;
  onClose: () => void;
  projectKey: string;
  states: readonly WorkflowStateOption[];
}) {
  const zero = useZero();
  const [issue, issueResult] = useQuery(
    zeroQueries.issues.byID({ issueID })
  );
  const [comments, commentsResult] = useQuery(
    zeroQueries.comments.byIssue({ issueID })
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!issue) return;
    setTitle(issue.title);
    setDescription(issue.description ?? "");
  }, [issue]);

  const updateIssue = async (fields: {
    title?: string;
    description?: string | null;
    priority?: IssuePriority;
    stateID?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await waitForZeroMutation(
        zero.mutate(
          zeroMutators.issues.update({
            id: issueID,
            ...fields,
          })
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update issue"
      );
    } finally {
      setSaving(false);
    }
  };

  const saveText = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    await updateIssue({
      title: nextTitle,
      description: description.trim() || null,
    });
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = comment.trim();
    if (!body) return;

    setComment("");
    setError(null);
    try {
      await waitForZeroMutation(
        zero.mutate(
          zeroMutators.comments.create({
            id: crypto.randomUUID(),
            issueID,
            body,
          })
        )
      );
    } catch (cause) {
      setComment(body);
      setError(
        cause instanceof Error ? cause.message : "Unable to add comment"
      );
    }
  };

  const archiveIssue = async () => {
    setSaving(true);
    setError(null);
    try {
      await waitForZeroMutation(
        zero.mutate(zeroMutators.issues.archive({ id: issueID }))
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to archive issue"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]"
      role="dialog"
    >
      <button
        aria-label="Close issue"
        className="min-w-0 flex-1 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#090d16] p-5 shadow-2xl">
        {issueResult.type === "unknown" || commentsResult.type === "unknown" ? (
          <BoardMessage>Syncing issue…</BoardMessage>
        ) : issueResult.type === "error" ? (
          <BoardMessage tone="error">
            {issueResult.error.message}
          </BoardMessage>
        ) : !issue ? (
          <BoardMessage>Issue is no longer available.</BoardMessage>
        ) : (
          <div className="space-y-5">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  {issueKey(projectKey, issue.number)}
                </p>
                <p className="mt-1 text-xs text-white/35">
                  Optimistic edits · authoritative authorization
                </p>
              </div>
              <button
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </header>

            <form className="space-y-3" onSubmit={saveText}>
              <input
                className="w-full rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5 text-lg font-semibold text-white outline-none focus:border-cyan-300/35"
                disabled={!canWrite || saving}
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
              <textarea
                className="min-h-40 w-full resize-y rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-sm leading-6 text-white/80 outline-none focus:border-cyan-300/35"
                disabled={!canWrite || saving}
                maxLength={20000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description"
                value={description}
              />
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  disabled={!canWrite || saving}
                  onChange={(event) =>
                    void updateIssue({ stateID: event.target.value })
                  }
                  value={issue.stateID}
                >
                  {states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                  disabled={!canWrite || saving}
                  onChange={(event) =>
                    void updateIssue({
                      priority: event.target.value as IssuePriority,
                    })
                  }
                  value={issue.priority}
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
                {canWrite ? (
                  <button
                    className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                    disabled={saving || !title.trim()}
                    type="submit"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                ) : null}
              </div>
            </form>

            {error ? (
              <div className="rounded-lg border border-red-400/20 bg-red-400/7 px-3 py-2 text-sm text-red-200">
                Mutation rejected and rolled back: {error}
              </div>
            ) : null}

            <section className="space-y-3 border-t border-white/8 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                  Comments
                </h3>
                <span className="text-[11px] text-white/35">
                  {comments.length}
                </span>
              </div>
              {commentsResult.type === "error" ? (
                <p className="text-sm text-red-300">
                  {commentsResult.error.message}
                </p>
              ) : (
                <div className="space-y-2">
                  {comments.map((item) => (
                    <article
                      className="rounded-xl border border-white/7 bg-white/[0.02] p-3"
                      key={item.id}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] text-white/35">
                        <span>
                          {item.author?.displayName ?? "Workspace member"}
                        </span>
                        <time>
                          {new Date(item.createdAt).toLocaleString("ru-RU")}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">
                        {item.body}
                      </p>
                    </article>
                  ))}
                  {comments.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/8 px-3 py-6 text-center text-sm text-white/35">
                      No comments yet
                    </p>
                  ) : null}
                </div>
              )}

              {canWrite ? (
                <form className="flex gap-2" onSubmit={addComment}>
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/35"
                    maxLength={20000}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Add an optimistic comment"
                    value={comment}
                  />
                  <button
                    className="rounded-lg border border-cyan-300/20 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
                    disabled={!comment.trim()}
                    type="submit"
                  >
                    Add
                  </button>
                </form>
              ) : null}
            </section>

            {canWrite ? (
              <div className="border-t border-white/8 pt-4">
                <button
                  className="rounded-lg border border-red-400/20 px-3 py-2 text-sm text-red-200 transition hover:bg-red-400/8"
                  disabled={saving}
                  onClick={() => void archiveIssue()}
                  type="button"
                >
                  Archive issue
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PriorityDot({ value }: { value: IssuePriority }) {
  const color = {
    LOW: "bg-slate-400",
    MEDIUM: "bg-blue-400",
    HIGH: "bg-amber-400",
    CRITICAL: "bg-red-400",
  }[value];

  return (
    <span className="flex items-center gap-1.5 text-[10px] text-white/35">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {value}
    </span>
  );
}

function BoardMessage({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={`grid min-h-64 place-items-center rounded-2xl border p-6 text-sm ${
        tone === "error"
          ? "border-red-400/15 bg-red-400/5 text-red-200"
          : "border-white/8 bg-white/[0.015] text-white/45"
      }`}
    >
      {children}
    </div>
  );
}
