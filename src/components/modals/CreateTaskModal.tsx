"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

import Button from "../ui/Button";
import { toast } from "../ui/toast";
import ProjectKeyPicker from "./ProjectKeyPicker";
import TagsPicker from "./TagsPicker";
import AttachmentsPanel, { type AttachmentItem } from "./AttachmentsPanel";
import { createTaskAction } from "@/server/actions/tasks";
import type { TaskInput, TaskStatus } from "@/server/validators/task";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { buildIssueDetailHref } from "@/shared/issueNavigation";

type ProjectOption = {
  id: string;
  name: string;
  key: string;
  canWrite?: boolean;
};
type UserOption = { id: string; name: string | null; email: string };

type IssueType = "Bug" | "Task";
type PriorityType = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const TYPE_OPTIONS: Array<{ value: IssueType; label: string }> = [
  { value: "Bug", label: "Bug" },
  { value: "Task", label: "Task" },
];

const PRIORITY_OPTIONS: Array<{ value: PriorityType; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "TESTING", label: "Testing" },
  { value: "DONE", label: "Done" },
  { value: "HOLD", label: "Hold" },
  { value: "REJECT", label: "Reject" },
];

const STATUS_TONE: Record<TaskStatus, string> = {
  NEW: "border-white/35",
  TODO: "border-white/35",
  HOLD: "border-orange-400",
  IN_PROGRESS: "border-amber-400",
  TESTING: "border-cyan-400",
  DONE: "border-emerald-400",
  REJECT: "border-rose-400",
};

async function uploadMany(
  items: Array<{ clientId: string; file: File }>,
  issueKey: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const { clientId, file } of items) {
    const contentType = file.type || "application/octet-stream";
    const prepareResponse = await fetch(
      `/api/ui/issues/${encodeURIComponent(issueKey)}/attachments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      }
    );
    const prepared = (await prepareResponse.json().catch(() => null)) as {
      ok?: boolean;
      attachmentId?: string;
      uploadUrl?: string;
      headers?: Record<string, string>;
      error?: string | { message?: string };
    } | null;
    if (
      !prepareResponse.ok ||
      !prepared?.attachmentId ||
      !prepared.uploadUrl
    ) {
      const message =
        typeof prepared?.error === "string"
          ? prepared.error
          : prepared?.error?.message;
      throw new Error(message || "Upload preparation failed");
    }

    const uploadResponse = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: prepared.headers,
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed (${uploadResponse.status})`);
    }

    const confirmResponse = await fetch(
      `/api/ui/issues/${encodeURIComponent(
        issueKey
      )}/attachments/${encodeURIComponent(prepared.attachmentId)}/confirm`,
      { method: "POST" }
    );
    if (!confirmResponse.ok) {
      const confirmation = (await confirmResponse
        .json()
        .catch(() => null)) as {
        error?: string | { message?: string };
      } | null;
      const message =
        typeof confirmation?.error === "string"
          ? confirmation.error
          : confirmation?.error?.message;
      throw new Error(message || "Upload confirmation failed");
    }
    map.set(
      clientId,
      `/api/ui/issues/${encodeURIComponent(
        issueKey
      )}/attachments/${encodeURIComponent(
        prepared.attachmentId
      )}/download?filename=${encodeURIComponent(file.name)}`
    );
  }
  return map;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type CompactSelectOption<T extends string> = {
  value: T;
  label: string;
};

type CompactSelectProps<T extends string> = {
  value: T;
  options: readonly CompactSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  leading: React.ReactNode;
};

function CompactSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  leading,
}: CompactSelectProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08]",
          "bg-white/[0.035] px-2.5 text-[12px] text-white/70 transition-colors",
          "hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/90",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
        )}
      >
        {leading}
        <span className="max-w-[150px] truncate">
          {selected?.label ?? value}
        </span>
        <span aria-hidden="true" className="text-white/35">
          ▾
        </span>
      </ListboxButton>

      <ListboxOptions
        anchor="bottom start"
        portal
        modal={false}
        className={cn(
          "z-[70] mt-1 max-h-[260px] min-w-[170px] overflow-y-auto rounded-lg",
          "border border-white/[0.11] bg-[#1a1d23] p-1 text-[12px] text-white/75",
          "shadow-[0_18px_55px_rgba(0,0,0,0.65)] focus:outline-none"
        )}
      >
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className={({ focus, selected: isSelected }) =>
              cn(
                "flex h-8 cursor-default items-center gap-2 rounded-md px-2.5 outline-none",
                focus && "bg-white/[0.07] text-white",
                isSelected && "text-white"
              )
            }
          >
            {({ selected: isSelected }) => (
              <>
                <span className="min-w-0 flex-1 truncate">
                  {option.label}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "text-[11px] text-cyan-200",
                    !isSelected && "invisible"
                  )}
                >
                  ✓
                </span>
              </>
            )}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
}

function buildBugTemplatePlain() {
  return [
    "Описание:",
    "",
    "Окружение:",
    "",
    "",
    "Шаги:",
    "1) ",
    "",
    "Ожидаемое:",
    "",
    "",
    "Фактическое:",
    "",
    "",
  ].join("\n");
}

function makeClientId(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (
    data: TaskInput
  ) => Promise<Awaited<ReturnType<typeof createTaskAction>>>;
  loading?: boolean;
  errorMessage?: string | null;
  projects: ProjectOption[];
  users?: UserOption[];
  initialProjectId?: string | null;
  initialStatus?: TaskStatus | null;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  errorMessage,
  projects,
  users = [],
  initialProjectId,
  initialStatus,
}: CreateTaskModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  const [projectId, setProjectId] = useState<string>("");
  const [type, setType] = useState<IssueType>("Bug");
  const [priority, setPriority] = useState<PriorityType>("MEDIUM");
  const [status, setStatus] = useState<TaskStatus>("NEW");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [requesterName, setRequesterName] = useState<string>("");
  const [showMore, setShowMore] = useState(false);
  const [createMore, setCreateMore] = useState(false);

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // drag overlay
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen || !initialProjectId) return;
    const exists = projects.some((p) => p.id === initialProjectId);
    if (exists) {
      setProjectId(initialProjectId);
    }
  }, [initialProjectId, isOpen, projects]);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(initialStatus ?? "NEW");
  }, [initialStatus, isOpen]);

  const firstProjectId = projects?.[0]?.id ?? "";
  const effectiveProjectId = projectId || firstProjectId;
  const assigneeOptions = useMemo(
    () => [
      { value: "", label: "Unassigned" },
      ...users.map((user) => ({
        value: user.id,
        label: user.name || user.email,
      })),
    ],
    [users]
  );

  const resetForm = useCallback(() => {
    setProjectId("");
    setType("Bug");
    setPriority("MEDIUM");
    setStatus("NEW");
    setAssigneeId("");
    setTitle("");
    setDescription("");
    setTags([]);
    setRequesterName("");
    setShowMore(false);
    setCreateMore(false);
    setAttachments([]);
    setLocalError(null);
    setDragOver(false);
    dragCounter.current = 0;
  }, []);

  const close = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const insertTemplate = useCallback(() => {
    const tpl = buildBugTemplatePlain();
    setDescription((prev) => {
      const base = (prev ?? "").trim();
      if (!base) return tpl;
      return `${base}\n\n${tpl}`;
    });
  }, []);

  const pickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const queued = files.map((file) => ({ clientId: makeClientId(), file }));
    setAttachments((prev) => [
      ...queued.map(({ clientId, file }) => ({
        clientId,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        state: "queued" as const,
        file,
      })),
      ...prev,
    ]);
  }, []);

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;

      const files = Array.from(list);
      // сброс, чтобы можно было выбрать тот же файл снова
      e.target.value = "";
      await addFiles(files);
    },
    [addFiles]
  );

  const removeAttachment = useCallback((clientId: string) => {
    setAttachments((prev) => prev.filter((a) => a.clientId !== clientId));
  }, []);

  const submit = useCallback(async () => {
    if (loading || submitting) return;
    setLocalError(null);

    const pid = effectiveProjectId;
    if (!pid) {
      const msg = "Select product";
      setLocalError(msg);
      toast.error("Cannot create issue", msg);
      return;
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      const msg = "Title: минимум 3 символа";
      setLocalError(msg);
      toast.error("Cannot create issue", msg);
      return;
    }

    // чтобы можно было создать одной строкой title
    const effectiveRequesterName = requesterName.trim() || "Guest";

    const payload: TaskInput = {
      projectId: pid,
      type,
      title: trimmedTitle,
      description: description?.trim() ? description : undefined,
      priority,
      status,
      tags: tags.length ? tags : undefined,
      attachments: [],
      requesterName: effectiveRequesterName,
      assigneeId: assigneeId || undefined,
    };

    try {
      setSubmitting(true);

      const res = onSubmit
        ? await onSubmit(payload)
        : await createTaskAction(payload);

      if (!res.ok) {
        const msg =
          res.formError ||
          (res.fieldErrors
            ? Object.values(res.fieldErrors).flat().filter(Boolean).join("\n")
            : "Не удалось создать задачу.");
        setLocalError(msg || "Не удалось создать задачу.");
        if (isAuthRequiredError({ formError: res.formError ?? null })) {
          showAuthRequiredToast();
        } else {
          toast.error("Issue not created", msg || "Не удалось создать задачу.");
        }
        return;
      }

      const queued = attachments.flatMap((attachment) =>
        attachment.file
          ? [{ clientId: attachment.clientId, file: attachment.file }]
          : []
      );
      if (queued.length > 0) {
        setAttachments((prev) =>
          prev.map((attachment) =>
            attachment.file
              ? { ...attachment, state: "uploading" as const }
              : attachment
          )
        );
        try {
          await uploadMany(queued, res.key);
        } catch (error) {
          toast.error(
            "Issue created, attachments failed",
            error instanceof Error ? error.message : "Upload failed"
          );
        }
      }

      toast.success("Issue created", res.key);

      if (createMore) {
        setTitle("");
        setDescription("");
        setTags([]);
        setRequesterName("");
        setAttachments([]);
        setLocalError(null);
        requestAnimationFrame(() => titleRef.current?.focus());
        router.refresh();
        return;
      }

      close();
      const projectKey = projects.find((project) => project.id === pid)?.key;
      router.push(
        buildIssueDetailHref(res.key, searchParams, {
          projectId: pid,
          projectKey,
        })
      );
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }, [
    loading,
    submitting,
    effectiveProjectId,
    title,
    description,
    type,
    priority,
    status,
    tags,
    requesterName,
    attachments,
    assigneeId,
    createMore,
    onSubmit,
    close,
    projects,
    router,
    searchParams,
  ]);

  // focus on open
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [isOpen]);

  // hotkeys
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        insertTemplate();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close, submit, insertTemplate]);

  // drag handlers (на body модалки)
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current += 1;
    setDragOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragOver(false);

      const files = Array.from(e.dataTransfer.files || []);
      await addFiles(files);
    },
    [addFiles]
  );

  if (!mounted || !isOpen) return null;

  const busy = loading || submitting;

  const chipBase =
    "inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.035] px-2.5 text-[12px] text-white/70 " +
    "transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/90 focus-within:ring-2 focus-within:ring-cyan-400/30";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/60"
        onClick={close}
      />

      <div className="relative z-10 flex h-full w-full items-start justify-center px-3 pb-3 pt-4 sm:px-6 sm:pb-6 sm:pt-[12vh]">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-issue-title"
          className={cn(
            "w-full max-w-[780px] overflow-visible",
            "rounded-xl border border-white/[0.11]",
            "bg-[#111318]/95 shadow-[0_24px_90px_rgba(0,0,0,0.62)] backdrop-blur-md",
            "max-h-[94vh] sm:max-h-[80vh]"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <ProjectKeyPicker
                projects={projects}
                value={effectiveProjectId}
                onChange={setProjectId}
              />
              <span aria-hidden="true" className="text-xs text-white/25">
                ›
              </span>
              <div
                id="create-issue-title"
                className="min-w-0 truncate text-[13px] font-medium text-white/75"
              >
                New issue
              </div>
            </div>

            <button
              type="button"
              onClick={close}
              className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
              aria-label="Close"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>

          <div
            className="relative max-h-[calc(94vh-48px)] overflow-y-auto px-4 pb-3 pt-2 sm:max-h-[calc(80vh-48px)] sm:px-5"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFileInputChange}
            />

            {dragOver ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center px-4 pt-12">
                <div className="w-full rounded-xl border border-cyan-300/20 bg-[#161a20]/95 shadow-xl">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70">
                      📎
                    </div>
                    <div className="text-[13px] text-white/90">
                      Drop files to attach
                    </div>
                    <div className="ml-auto text-[12px] text-white/40">
                      Release to add
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(
                "w-full bg-transparent",
                "text-[21px] font-medium leading-8 text-white/95",
                "placeholder:text-white/25",
                "focus:outline-none"
              )}
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              rows={2}
              className={cn(
                "mt-1 min-h-[68px] max-h-[220px] w-full resize-none overflow-y-auto bg-transparent",
                "text-[14px] leading-6 text-white/75 placeholder:text-white/25",
                "[field-sizing:content] focus:outline-none"
              )}
            />

            <AttachmentsPanel items={attachments} onRemove={removeAttachment} />

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <CompactSelect
                value={type}
                options={TYPE_OPTIONS}
                onChange={setType}
                ariaLabel="Issue type"
                leading={
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-fuchsia-400/80"
                  />
                }
              />

              <CompactSelect
                value={priority}
                options={PRIORITY_OPTIONS}
                onChange={setPriority}
                ariaLabel="Priority"
                leading={
                  <span aria-hidden="true" className="text-white/35">
                    ≡
                  </span>
                }
              />

              <CompactSelect
                value={status}
                options={STATUS_OPTIONS}
                onChange={setStatus}
                ariaLabel="Status"
                leading={
                  <span
                    aria-hidden="true"
                    className={`h-3 w-3 rounded-full border-2 ${STATUS_TONE[status]}`}
                  />
                }
              />

              <CompactSelect
                value={assigneeId}
                options={assigneeOptions}
                onChange={setAssigneeId}
                ariaLabel="Assignee"
                leading={
                  <span
                    aria-hidden="true"
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/25 text-[8px] text-white/45"
                  >
                    {assigneeId ? "✓" : "–"}
                  </span>
                }
              />

              <TagsPicker value={tags} onChange={setTags} />

              <button
                type="button"
                onClick={() => setShowMore((current) => !current)}
                className={cn(
                  chipBase,
                  "w-7 justify-center px-0 text-base tracking-widest"
                )}
                aria-expanded={showMore}
                aria-controls="create-issue-more-options"
                title="More options"
              >
                …
              </button>
            </div>

            {showMore ? (
              <div
                id="create-issue-more-options"
                className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] p-2"
              >
                <label className="flex min-w-[260px] flex-1 items-center gap-2">
                  <span className="text-[11px] text-white/40">Reporter</span>
                  <input
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder="Guest (optional)"
                    autoComplete="off"
                    className="h-7 min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/10 px-2.5 text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                  />
                </label>
                <button
                  type="button"
                  onClick={insertTemplate}
                  className={chipBase}
                  title="Ctrl/Cmd+Shift+B"
                >
                  Apply bug template
                  <span className="text-[10px] text-white/30">⌘⇧B</span>
                </button>
              </div>
            ) : null}

            {localError || errorMessage ? (
              <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {localError || errorMessage}
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={pickFiles}
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                title="Attach files"
                aria-label="Attach files"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
                </svg>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={createMore}
                  onClick={() => setCreateMore((current) => !current)}
                  className="flex items-center gap-2 rounded-md text-[12px] text-white/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative h-4 w-7 rounded-full border transition-colors",
                      createMore
                        ? "border-cyan-300/30 bg-cyan-400/25"
                        : "border-white/10 bg-white/10"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white/80 transition-transform",
                        createMore ? "translate-x-3.5" : "translate-x-0.5"
                      )}
                    />
                  </span>
                  Create more
                </button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={submit}
                  disabled={
                    busy || title.trim().length < 3 || !effectiveProjectId
                  }
                  className="h-8 rounded-md bg-cyan-400/20 px-3 text-[12px] text-cyan-50 hover:bg-cyan-400/25"
                >
                  {busy ? "Creating…" : "Create issue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
