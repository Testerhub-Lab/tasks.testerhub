"use client";

import React from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import BackButton from "./BackButton";
import IssueMetaPanel from "./IssueMetaPanel";
import type { Task } from "@prisma/client";
import { getPriorityClasses, normalizePriority } from "./utils";

const parseDetails = (raw?: string | null) => {
  const result: {
    type?: string | null;
    description?: string | null;
    steps?: string | null;
    expected?: string | null;
    actual?: string | null;
    environment?: string | null;
  } = {
    type: null,
    description: raw ?? null,
    steps: null,
    expected: null,
    actual: null,
    environment: null,
  };

  if (!raw) return result;

  const chunks = raw.split(/\n\n+/);
  let hasStructured = false;

  for (const chunk of chunks) {
    const [label, ...rest] = chunk.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;

    const normalized = label.trim().toLowerCase();
    switch (normalized) {
      case "тип":
        result.type = value;
        hasStructured = true;
        break;
      case "описание":
        result.description = value;
        hasStructured = true;
        break;
      case "шаги":
        result.steps = value;
        hasStructured = true;
        break;
      case "ожидаемое":
        result.expected = value;
        hasStructured = true;
        break;
      case "фактическое":
        result.actual = value;
        hasStructured = true;
        break;
      case "окружение":
        result.environment = value;
        hasStructured = true;
        break;
      default:
        break;
    }
  }

  if (!hasStructured) {
    result.description = raw;
  }

  return result;
};

interface IssueDetailsClientProps {
  task: Task;
  projectLabel?: string | null;
}

const IssueDetailsClient: React.FC<IssueDetailsClientProps> = ({
  task,
  projectLabel,
}) => {
  const details = parseDetails(task.description);
  const isBug = details.type?.toLowerCase() === "bug";
  const priority = normalizePriority(task.priority);
  const issueKey = task.key ?? task.id;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        {/* line 1: key + type */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {issueKey}
          </span>
          {details.type ? <Badge className="text-xs">{details.type}</Badge> : null}
        </div>

        {/* line 2: title */}
        <h1 className="text-3xl font-semibold leading-tight">{task.title}</h1>

        {/* line 3: status + priority */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={getPriorityClasses(priority)}>
            {priority ?? task.priority ?? "—"}
          </Badge>
          <Badge>{task.status}</Badge>
        </div>

        {/* line 4: tags */}
        {task.tags.length ? (
          <div className="flex flex-wrap gap-2">
            {task.tags.map((tag) => (
              <Badge key={tag} className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

        <BackButton />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Description
            </h2>

            {details.description?.trim() ? (
              <p className="text-base text-[var(--color-text)] whitespace-pre-wrap">
                {details.description}
              </p>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No description yet.
              </p>
            )}
          </Card>

          {isBug ? (
            <Card className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Bug details
              </h2>

              {details.steps ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">Steps</div>
                  <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                    {details.steps}
                  </p>
                </div>
              ) : null}

              {details.expected ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">
                    Expected
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                    {details.expected}
                  </p>
                </div>
              ) : null}

              {details.actual ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">Actual</div>
                  <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                    {details.actual}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Attachments
            </h2>
            {task.attachments.length ? (
              <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                {task.attachments.map((file) => (
                  <li key={file}>
                    <a
                      href={file}
                      className="text-[var(--color-primary)] hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.split("/").pop()}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No attachments.
              </p>
            )}
          </Card>
        </div>

        <IssueMetaPanel
          id={task.id}
          projectLabel={projectLabel ?? null}
          status={task.status}
          priority={task.priority}
          environment={details.environment}
          createdAt={task.createdAt}
          updatedAt={task.createdAt}
        />
      </div>
    </div>
  );
};

export default IssueDetailsClient;
