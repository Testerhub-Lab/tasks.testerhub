"use client";

import React, { useEffect, useRef, useState } from "react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import BackButton from "./BackButton";
import IssueMetaPanel from "./IssueMetaPanel";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import { getDisplayName } from "../../server/auth/displayName";
import { updateTaskFieldsAction } from "../../server/actions/tasks";
import { toast } from "../ui/toast";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";

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
  task: TaskWithProjectAndReporter;
  projectLabel?: string | null;
  users: Array<{ id: string; name: string | null; email: string }>;
}

const IssueDetailsClient: React.FC<IssueDetailsClientProps> = ({
  task,
  projectLabel,
  users,
}) => {
  const issueKey = task.key ?? task.id;
  const reporterName = getDisplayName({
    user: task.reporter ?? null,
    fallbackName: task.requesterName ?? null,
  });
  const [titleValue, setTitleValue] = useState(task.title ?? "");
  const [descriptionValue, setDescriptionValue] = useState(task.description ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const originalTitleRef = useRef(titleValue);
  const originalDescriptionRef = useRef(descriptionValue);
  const skipTitleBlurRef = useRef(false);
  const skipDescriptionBlurRef = useRef(false);

  const details = parseDetails(descriptionValue);
  const [copied, setCopied] = useState<"key" | "link" | null>(null);
  const timerRef = useRef<number | null>(null);

  const showCopied = (value: "key" | "link") => {
    setCopied(value);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopied(null);
    }, 1200);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const handleCopyKey = async () => {
    const ok = await copyToClipboard(issueKey);
    if (ok) {
      showCopied("key");
    }
  };

  const handleCopyLink = async () => {
    if (typeof window === "undefined") return;
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      showCopied("link");
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const isEmptyValue = (value?: string | null) => {
    if (!value) return true;
    const trimmed = value.trim();
    return trimmed.length === 0;
  };

  const cleanSummary = (value?: string | null) => {
    if (!value) return "";
    const trimmed = value.trim();
    const match = trimmed.match(/^(summary|суммари)[:\s-]*\n?/i);
    if (!match) return trimmed;
    return trimmed.slice(match[0].length).trim();
  };

  const stepsList = details.steps
    ? details.steps
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  useEffect(() => {
    if (!editingTitle) {
      const nextTitle = task.title ?? "";
      setTitleValue(nextTitle);
      originalTitleRef.current = nextTitle;
    }
  }, [task.title, editingTitle]);

  useEffect(() => {
    if (!editingDescription) {
      const nextDescription = task.description ?? "";
      setDescriptionValue(nextDescription);
      originalDescriptionRef.current = nextDescription;
    }
  }, [task.description, editingDescription]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      const input = titleInputRef.current;
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingDescription && descriptionRef.current) {
      const textarea = descriptionRef.current;
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }, [editingDescription]);

  const cancelTitleEdit = () => {
    setTitleValue(originalTitleRef.current);
    setEditingTitle(false);
  };

  const cancelDescriptionEdit = () => {
    setDescriptionValue(originalDescriptionRef.current);
    setEditingDescription(false);
  };

  const commitTitle = async (nextValue: string) => {
    const trimmed = nextValue.trim();
    if (!trimmed) {
      toast.error("Заголовок не может быть пустым.");
      setTitleValue(originalTitleRef.current);
      setEditingTitle(false);
      return;
    }

    if (trimmed === originalTitleRef.current) {
      setEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    setTitleValue(trimmed);
    try {
      const result = await updateTaskFieldsAction({
        id: task.id,
        title: trimmed,
      });
      if (!result.ok) {
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
        } else {
          toast.error("Не удалось обновить заголовок.");
        }
        setTitleValue(originalTitleRef.current);
        setEditingTitle(false);
        return;
      }
      originalTitleRef.current = trimmed;
      setEditingTitle(false);
    } finally {
      setSavingTitle(false);
    }
  };

  const commitDescription = async (nextValue: string) => {
    const trimmed = nextValue.trim();
    const payload = trimmed.length ? trimmed : null;
    const nextDescription = payload ?? "";

    if (nextDescription === originalDescriptionRef.current) {
      setEditingDescription(false);
      return;
    }

    setSavingDescription(true);
    setDescriptionValue(nextDescription);
    try {
      const result = await updateTaskFieldsAction({
        id: task.id,
        description: payload,
      });
      if (!result.ok) {
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
        } else {
          toast.error("Не удалось обновить описание.");
        }
        setDescriptionValue(originalDescriptionRef.current);
        setEditingDescription(false);
        return;
      }
      originalDescriptionRef.current = nextDescription;
      setEditingDescription(false);
    } finally {
      setSavingDescription(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
            <button
              type="button"
              onClick={handleCopyKey}
              className="font-semibold uppercase tracking-wide text-white/70 transition-colors hover:text-white"
            >
              {issueKey}
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copy issue link"
              className="inline-flex items-center gap-2 text-white/55 transition-colors hover:text-white"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1" />
                <path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1" />
              </svg>
              <span className="hidden sm:inline">Copy link</span>
            </button>
            {copied === "key" || copied === "link" ? (
              <span className="text-[11px] text-white/55">Copied</span>
            ) : null}
          </div>

          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      skipTitleBlurRef.current = true;
                      void commitTitle(titleValue);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      skipTitleBlurRef.current = true;
                      cancelTitleEdit();
                    }
                  }}
                  onBlur={() => {
                    if (skipTitleBlurRef.current) {
                      skipTitleBlurRef.current = false;
                      return;
                    }
                    void commitTitle(titleValue);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-2xl font-semibold leading-tight text-white outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/40"
                  disabled={savingTitle}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="w-full rounded-lg px-2 py-1 text-left text-2xl font-semibold leading-tight text-white transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                >
                  {titleValue}
                </button>
              )}
            </div>
          </div>

          {savingTitle ? (
            <span className="text-xs text-white/50">Saving...</span>
          ) : null}

          {details.type || task.tags.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {details.type ? (
                <Badge className="text-xs">{details.type}</Badge>
              ) : null}
              {task.tags.map((tag) => (
                <Badge key={tag} className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <BackButton />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-6">
          <Card className="flex flex-col gap-3 border border-white/6 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between text-xs text-white/60">
              <h2 className="text-sm font-medium text-white/70">Description</h2>
            </div>

            {editingDescription ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
                  <span>Editing</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cancelDescriptionEdit()}
                      className="rounded-md px-2 py-1 text-white/70 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => commitDescription(descriptionValue)}
                      className="rounded-md px-2 py-1 text-white hover:bg-white/10"
                    >
                      Save
                    </button>
                  </div>
                </div>
                <textarea
                  ref={descriptionRef}
                  value={descriptionValue}
                  onChange={(event) => setDescriptionValue(event.target.value)}
                  spellCheck={false}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      skipDescriptionBlurRef.current = true;
                      void commitDescription(descriptionValue);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      skipDescriptionBlurRef.current = true;
                      cancelDescriptionEdit();
                    }
                  }}
                  className="min-h-[260px] w-full resize-y rounded-md border border-transparent bg-transparent px-3 py-2 text-sm text-white outline-none shadow-none transition focus:border-transparent focus:ring-0 focus:outline-none focus:shadow-none"
                  rows={12}
                  disabled={savingDescription}
                />
                <div className="text-xs text-white/50">
                  Ctrl/Cmd + Enter to save • Esc to cancel
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingDescription(true)}
                className="w-full rounded-md px-2 py-2 text-left transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30"
              >
                <div className="space-y-4 prose prose-invert max-w-none">
                  {!isEmptyValue(details.description) ? (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-white/70">Summary</div>
                      <p className="text-base text-[var(--color-text)] whitespace-pre-wrap">
                        {cleanSummary(details.description)}
                      </p>
                    </div>
                  ) : null}

                  {!isEmptyValue(details.environment) ? (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-white/70">Environment</div>
                      <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                        {details.environment}
                      </p>
                    </div>
                  ) : null}

                  {stepsList.length ? (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-white/70">Steps</div>
                      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--color-text-secondary)]">
                        {stepsList.map((step, idx) => (
                          <li key={`${step}-${idx}`}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {!isEmptyValue(details.expected) ? (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-white/70">Expected</div>
                      <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                        {details.expected}
                      </p>
                    </div>
                  ) : null}

                  {!isEmptyValue(details.actual) ? (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-white/70">Actual</div>
                      <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">
                        {details.actual}
                      </p>
                    </div>
                  ) : null}

                  {isEmptyValue(details.description) &&
                  isEmptyValue(details.environment) &&
                  stepsList.length === 0 &&
                  isEmptyValue(details.expected) &&
                  isEmptyValue(details.actual) ? (
                    <p className="text-sm text-white/50">
                      Add description...
                    </p>
                  ) : null}
                </div>
              </button>
            )}
            {savingDescription ? (
              <span className="text-xs text-white/50">
                Saving...
              </span>
            ) : null}
          </Card>

          {task.attachments.length ? (
            <Card className="flex flex-col gap-3 border border-white/6 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <h2 className="text-sm font-medium text-white/70">
                Attachments
              </h2>
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
            </Card>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-24 h-fit">
          <IssueMetaPanel
            id={task.id}
            projectLabel={projectLabel ?? null}
            status={task.status}
            priority={task.priority}
            environment={details.environment}
            reporterName={reporterName}
            assigneeId={task.assignee?.id ?? null}
            users={users}
            createdAt={task.createdAt}
            updatedAt={task.createdAt}
          />
        </div>
      </div>
    </div>
  );
};

export default IssueDetailsClient;
