"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { zeroMutators } from "@/zero/mutators";
import { zeroQueries } from "@/zero/queries";
import type { WorkspaceRole } from "@/zero/schema";
import { waitForZeroMutation } from "@/zero/client";
import Stage3Board from "./Stage3Board";

type WorkspaceRow = {
  id: string;
  name: string;
};

type Stage3WorkspaceProps = {
  userID: string;
  workspace: WorkspaceRow;
};

export default function Stage3Workspace({
  userID,
  workspace,
}: Stage3WorkspaceProps) {
  const [members, membersResult] = useQuery(
    zeroQueries.members.byWorkspace({ workspaceID: workspace.id })
  );
  const [workflows, workflowsResult] = useQuery(
    zeroQueries.workflows.byWorkspace({ workspaceID: workspace.id })
  );
  const [projects, projectsResult] = useQuery(
    zeroQueries.projects.byWorkspace({ workspaceID: workspace.id })
  );
  const [selectedProjectID, setSelectedProjectID] = useState<string | null>(
    null
  );
  const [showProjectForm, setShowProjectForm] = useState(false);

  const effectiveProjectID = projects.some(
    (project) => project.id === selectedProjectID
  )
    ? selectedProjectID
    : (projects[0]?.id ?? null);

  const role =
    (members.find((member) => member.userID === userID)?.role as
      | WorkspaceRole
      | undefined) ?? null;
  const canManageProjects = role === "OWNER" || role === "ADMIN";
  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === effectiveProjectID) ?? null,
    [effectiveProjectID, projects]
  );
  const defaultWorkflow =
    workflows.find((workflow) => workflow.isDefault) ?? workflows[0] ?? null;

  if (
    membersResult.type === "unknown" ||
    workflowsResult.type === "unknown" ||
    projectsResult.type === "unknown"
  ) {
    return <WorkspaceMessage>Syncing workspace data…</WorkspaceMessage>;
  }

  const queryError = [membersResult, workflowsResult, projectsResult].find(
    (result) => result.type === "error"
  );
  if (queryError?.type === "error") {
    return (
      <WorkspaceMessage tone="error">
        {queryError.error.message}
      </WorkspaceMessage>
    );
  }

  return (
    <div className="grid min-h-[64vh] gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
        <div className="px-1">
          <p className="truncate text-sm font-semibold text-white">
            {workspace.name}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/40">
            {role ?? "No membership"}
          </p>
        </div>

        <div className="space-y-1">
          {projects.map((project) => (
            <button
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                project.id === effectiveProjectID
                  ? "bg-cyan-400/10 text-cyan-100"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
              key={project.id}
              onClick={() => setSelectedProjectID(project.id)}
              type="button"
            >
              <span className="block truncate text-sm font-medium">
                {project.name}
              </span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-white/35">
                {project.key}
              </span>
            </button>
          ))}
        </div>

        {canManageProjects ? (
          <button
            className="w-full rounded-lg border border-dashed border-white/12 px-3 py-2 text-sm text-white/55 transition hover:border-cyan-300/25 hover:text-cyan-100"
            onClick={() => setShowProjectForm((value) => !value)}
            type="button"
          >
            {showProjectForm ? "Cancel" : "+ New product"}
          </button>
        ) : null}

        {showProjectForm && defaultWorkflow ? (
          <CreateProjectForm
            onCreated={(projectID) => {
              setSelectedProjectID(projectID);
              setShowProjectForm(false);
            }}
            workflowID={defaultWorkflow.id}
            workspaceID={workspace.id}
          />
        ) : null}
      </aside>

      <main className="min-w-0">
        {selectedProject ? (
          <Stage3Board
            key={selectedProject.id}
            project={selectedProject}
            role={role}
          />
        ) : canManageProjects && defaultWorkflow ? (
          <div className="grid min-h-[60vh] place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Create the first product
              </h2>
              <p className="mt-1 text-sm text-white/50">
                Products, issues and comments in this screen use Zero only.
              </p>
              <button
                className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                onClick={() => setShowProjectForm(true)}
                type="button"
              >
                New product
              </button>
            </div>
          </div>
        ) : (
          <WorkspaceMessage>
            {defaultWorkflow
              ? "No accessible products."
              : "The workspace has no active workflow."}
          </WorkspaceMessage>
        )}
      </main>
    </div>
  );
}

function CreateProjectForm({
  onCreated,
  workflowID,
  workspaceID,
}: {
  onCreated: (projectID: string) => void;
  workflowID: string;
  workspaceID: string;
}) {
  const zero = useZero();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    const nextKey = key.trim().toUpperCase();
    if (!nextName || !/^[A-Z][A-Z0-9]{1,9}$/.test(nextKey)) return;

    const projectID = crypto.randomUUID();
    setSubmitting(true);
    setError(null);
    try {
      await waitForZeroMutation(
        zero.mutate(
          zeroMutators.projects.create({
            id: projectID,
            workspaceID,
            workflowID,
            key: nextKey,
            name: nextName,
            description: null,
          })
        )
      );
      onCreated(projectID);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to create product"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-2 rounded-xl border border-white/8 bg-slate-950/70 p-3"
      onSubmit={submit}
    >
      <input
        autoFocus
        className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none focus:border-cyan-300/40"
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
        placeholder="Product name"
        value={name}
      />
      <input
        className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-xs uppercase text-white outline-none focus:border-cyan-300/40"
        maxLength={10}
        onChange={(event) =>
          setKey(
            event.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, "")
              .slice(0, 10)
          )
        }
        placeholder="KEY"
        value={key}
      />
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <button
        className="w-full rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
        disabled={
          submitting ||
          !name.trim() ||
          !/^[A-Z][A-Z0-9]{1,9}$/.test(key)
        }
        type="submit"
      >
        {submitting ? "Creating…" : "Create"}
      </button>
    </form>
  );
}

function WorkspaceMessage({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={`grid min-h-[60vh] place-items-center rounded-2xl border p-6 text-sm ${
        tone === "error"
          ? "border-red-400/15 bg-red-400/5 text-red-200"
          : "border-white/8 bg-white/[0.015] text-white/50"
      }`}
    >
      {children}
    </div>
  );
}
