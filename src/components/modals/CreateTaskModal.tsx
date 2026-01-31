"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import Button from "../ui/Button";
import { toast } from "../ui/toast";
import ProjectKeyPicker from "./ProjectKeyPicker";
import AttachmentsPanel, { type AttachmentItem } from "./AttachmentsPanel";
import { createTaskAction } from "@/server/actions/tasks";
import type { TaskInput } from "@/server/validators/task";

type ProjectOption = { id: string; name: string; key: string };
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

type UploadMetaItem = {
  clientId: string;
  name: string;
  size: number;
  type: string;
};

type UploadResultItem = UploadMetaItem & {
  url: string;
  storedName: string;
};

type UploadApiOk = { ok: true; files: UploadResultItem[] };
type UploadApiErr = { ok: false; error: string };

type UploadApiResponse = UploadApiOk | UploadApiErr;

function isUploadOk(x: unknown): x is UploadApiOk {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.ok === true && Array.isArray(o.files);
}

function isUploadErr(x: unknown): x is UploadApiErr {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.ok === false && typeof o.error === "string";
}

async function uploadMany(items: Array<{ clientId: string; file: File }>): Promise<Map<string, string>> {
  const fd = new FormData();

  const meta: UploadMetaItem[] = items.map(({ clientId, file }) => ({
    clientId,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  }));

  for (const it of items) {
    fd.append("files", it.file, it.file.name); // ✅ твой API ждёт именно "files"
  }

  fd.append("meta", JSON.stringify(meta)); // ✅ массив, длина совпадает с files

  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (isUploadErr(json)) throw new Error(json.error);
    throw new Error("Upload failed");
  }

  if (!isUploadOk(json)) {
    if (isUploadErr(json)) throw new Error(json.error);
    throw new Error("Upload failed: unexpected response");
  }

  const map = new Map<string, string>();
  for (const f of json.files) {
    if (typeof f.clientId === "string" && typeof f.url === "string") {
      map.set(f.clientId, f.url);
    }
  }

  return map;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buildBugTemplatePlain() {
  return [
    "Summary:",
    "",
    "Environment:",
    "-",
    "",
    "Steps:",
    "1)",
    "",
    "Expected:",
    "-",
    "",
    "Actual:",
    "-",
    "",
  ].join("\n");
}

function makeClientId(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function uploadOne(file: File, clientId: string): Promise<{ url: string }> {
  const fd = new FormData();

  // ✅ максимально совместимо: разные бекенды ждут разные ключи
  fd.append("files", file, file.name);
  fd.append("files[]", file, file.name);
  fd.append("file", file, file.name);

  // если твой API использует clientId — ок, если нет — лишнее поле просто игнорится
  fd.append("clientId", clientId);

  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok || !json || typeof json !== "object") {
    throw new Error("Upload failed");
  }

  // поддержка разных форматов
  const obj = json as Record<string, unknown>;

  // common: { ok:false, error:"..." }
  if (obj.ok === false) {
    const msg = typeof obj.error === "string" ? obj.error : "Upload failed";
    throw new Error(msg);
  }

  // common: { ok:true, url:"/uploads/..." }
  if (obj.ok === true && typeof obj.url === "string" && obj.url) {
    return { url: obj.url };
  }

  // common: { ok:true, files:[{url|path|href}] } / { ok:true, items:[...] }
  const list =
    (Array.isArray(obj.files) ? obj.files : null) ??
    (Array.isArray(obj.items) ? obj.items : null) ??
    null;

  if (obj.ok === true && list && list.length > 0) {
    const first = list[0] as Record<string, unknown>;
    const url =
      (typeof first.url === "string" && first.url) ||
      (typeof first.path === "string" && first.path) ||
      (typeof first.href === "string" && first.href) ||
      "";

    if (url) return { url };
  }

  throw new Error("Upload failed: unexpected response");
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: TaskInput) => Promise<void> | void;
  loading?: boolean;
  errorMessage?: string | null;
  projects: ProjectOption[];
  users?: UserOption[];
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  errorMessage,
  projects,
  users = [],
}: CreateTaskModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const [projectId, setProjectId] = useState<string>("");
  const [type, setType] = useState<IssueType>("Bug");
  const [priority, setPriority] = useState<PriorityType>("MEDIUM");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [tagsText, setTagsText] = useState<string>("");
  const [requesterName, setRequesterName] = useState<string>("");

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // drag overlay
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  const firstProjectId = projects?.[0]?.id ?? "";
  const effectiveProjectId = projectId || firstProjectId;

  const resetForm = useCallback(() => {
    setProjectId("");
    setType("Bug");
    setPriority("MEDIUM");
    setAssigneeId("");
    setTitle("");
    setDescription("");
    setTagsText("");
    setRequesterName("");
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
  
    // показываем их сразу в UI
    setAttachments((prev) => [
      ...queued.map(({ clientId, file }) => ({
        clientId,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        state: "uploading" as const,
      })),
      ...prev,
    ]);
  
    try {
      const urlByClientId = await uploadMany(queued);
  
      setAttachments((prev) =>
        prev.map((it) => {
          if (it.state !== "uploading") return it;
          const url = urlByClientId.get(it.clientId);
          if (!url) return { ...it, state: "error", error: "Upload: missing url" };
          return { ...it, state: "done", url };
        })
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error("Upload failed", msg);
  
      setAttachments((prev) =>
        prev.map((it) => (it.state === "uploading" ? { ...it, state: "error", error: msg } : it))
      );
    }
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
      const msg = "Select project";
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

    const attachmentUrls = attachments
      .filter((a) => a.state === "done" && typeof a.url === "string" && a.url)
      .map((a) => a.url as string);

    const payload: TaskInput = {
      projectId: pid,
      type,
      title: trimmedTitle,
      description: description?.trim() ? description : undefined,
      priority,
      tags: tagsText?.trim() ? tagsText : undefined,
      attachments: attachmentUrls,
      requesterName: effectiveRequesterName,
      assigneeId: assigneeId || undefined,
    };

    try {
      setSubmitting(true);

      if (onSubmit) {
        await onSubmit(payload);
        toast.success("Issue created");
        close();
        router.refresh();
        return;
      }

      const res = await createTaskAction(payload);

      if (!res.ok) {
        const msg =
          res.formError ||
          (res.fieldErrors
            ? Object.values(res.fieldErrors).flat().filter(Boolean).join("\n")
            : "Не удалось создать задачу.");
        setLocalError(msg || "Не удалось создать задачу.");
        toast.error("Issue not created", msg || "Не удалось создать задачу.");
        return;
      }

      toast.success("Issue created", res.key);
      close();
      router.push(`/tasks/${res.key}`);
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
    tagsText,
    requesterName,
    attachments,
    assigneeId,
    onSubmit,
    close,
    router,
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
    "inline-flex h-7 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 text-[12px] text-slate-100 " +
    "hover:bg-white/7 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40";

  const selectBase = "appearance-none bg-transparent pr-6 outline-none text-slate-100";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={close}
      />

      <div className="relative z-10 flex h-full w-full items-start justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "w-full max-w-[980px]",
            "overflow-hidden rounded-2xl border border-white/10",
            "bg-slate-950/35 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.55)]",
            "max-h-[84vh]"
          )}
        >
          {/* header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <ProjectKeyPicker projects={projects} value={effectiveProjectId} onChange={setProjectId} />
              <div className="min-w-0 truncate text-[13px] text-slate-200/80">New issue</div>
            </div>

            <button
              type="button"
              onClick={close}
              className="rounded-md p-2 text-slate-200/70 hover:bg-white/5 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
              aria-label="Close"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          {/* body */}
          <div
            className="relative overflow-y-auto px-4 pb-4 pt-4"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {/* hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFileInputChange}
            />

            {/* drag overlay (как в Linear — без “поля”, просто поверх) */}
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center px-4 pt-16">
                <div className="w-full max-w-[920px] rounded-2xl border border-white/15 bg-slate-950/60 backdrop-blur-xl">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-200/80">
                      📎
                    </div>
                    <div className="text-[13px] text-slate-100">Drop files to attach</div>
                    <div className="ml-auto text-[12px] text-slate-400/70">Release to upload</div>
                  </div>
                </div>
              </div>
            )}

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
                "text-[28px] leading-tight text-slate-100",
                "placeholder:text-slate-500/70",
                "focus:outline-none"
              )}
            />

            {/* description */}
            <div className="mt-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add description…"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                rows={5}
                className={cn(
                  "w-full bg-transparent",
                  "text-base leading-relaxed text-slate-200/90",
                  "placeholder:text-slate-500/70",
                  "focus:outline-none",
                  "min-h-[140px] max-h-[280px] overflow-y-auto resize-y"
                )}
              />
            </div>

            {/* attachments list (если есть) */}
            <AttachmentsPanel
              items={attachments}
              onRemove={removeAttachment}
            />

            {/* controls row */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className={chipBase}>
                <select value={type} onChange={(e) => setType(e.target.value as IssueType)} className={selectBase}>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none text-slate-300/80">▾</span>
              </div>

              <div className={chipBase}>
                <select value={priority} onChange={(e) => setPriority(e.target.value as PriorityType)} className={selectBase}>
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none text-slate-300/80">▾</span>
              </div>

              <div className={chipBase} title="Assignee (может пока не сохраняться в БД)">
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectBase}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ? u.name : u.email}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none text-slate-300/80">▾</span>
              </div>

              {/* tags (вариант A) */}
              <div className={cn(chipBase, "w-[220px]")}>
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="tags…"
                  autoComplete="off"
                  className="w-full bg-transparent text-[12px] text-slate-100 placeholder:text-slate-500/70 focus:outline-none"
                />
              </div>

              <button type="button" onClick={insertTemplate} className={cn(chipBase, "gap-2")} title="Ctrl/Cmd+Shift+B">
                Template
                <span className="text-[11px] text-slate-300/60">⌘⇧B</span>
              </button>

              {/* 📎 Attach — как в Linear: иконка, без поля */}
              <button
                type="button"
                onClick={pickFiles}
                className={cn(chipBase, "px-2.5")}
                title="Attach files"
                aria-label="Attach"
              >
                📎
              </button>
            </div>

            {/* reporter compact */}
            <div className="mt-4 flex items-center gap-3">
              <div className="text-[12px] text-slate-300/70">Reporter</div>
              <input
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="Guest (optional)"
                autoComplete="off"
                className={cn(
                  "h-8 w-[260px] rounded-md border border-white/10 bg-white/5 px-3",
                  "text-[12px] text-slate-100 placeholder:text-slate-500/70",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                )}
              />
            </div>

            {(localError || errorMessage) && (
              <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {localError || errorMessage}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
            <div className="text-[12px] text-slate-400/60">Ctrl/Cmd+Enter — create · Esc — close</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={submit}
                disabled={busy || title.trim().length < 3 || !effectiveProjectId}
              >
                Create
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
