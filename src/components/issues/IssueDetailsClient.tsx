"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Card from "../ui/Card";
import BackButton from "./BackButton";
import IssueMetaPanel from "./IssueMetaPanel";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import { getDisplayName } from "../../server/auth/displayName";
import { deleteTaskAction, updateTaskFieldsAction } from "../../server/actions/tasks";
import { toast } from "../ui/toast";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TaskKnowledgePanel from "@/components/wiki/TaskKnowledgePanel";
import {
  buildProjectIssueViewHref,
} from "@/shared/issueNavigation";
import { getProjectKeyFromPathname } from "@/shared/projectKeyRoutes";

function attachmentLabel(url: string) {
  const encoded = /[?&]filename=([^&]+)/.exec(url)?.[1];
  if (!encoded) return url.split("/").pop();
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 whitespace-pre-wrap text-[15px] leading-7 text-white/82 last:mb-0">
      {children}
    </p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-200"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-[15px] leading-7 text-white/82">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-[15px] leading-7 text-white/82">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-white/15 pl-4 text-white/60">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-white/[0.09] bg-black/35 p-4 font-mono text-[13px] leading-5 text-white/82 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.9em] text-white/88">
      {children}
    </code>
  ),
};

const markdownPlugins = [remarkGfm];

function withDetectedCodeBlock(value: string) {
  if (value.includes("```")) return value;

  const lines = value.split("\n");
  const output: string[] = [];
  const looksLikeCode = (line: string) =>
    /^\s*(?:const|let|var|function|class|import|export|return)\b/.test(line) ||
    /^\s*[\w$.]+\s*=/.test(line) ||
    /\/\/\s*.+$/.test(line);

  for (let index = 0; index < lines.length; ) {
    if (!looksLikeCode(lines[index] ?? "")) {
      output.push(lines[index] ?? "");
      index += 1;
      continue;
    }

    const codeLines: string[] = [];
    while (index < lines.length && looksLikeCode(lines[index] ?? "")) {
      codeLines.push(lines[index] ?? "");
      index += 1;
    }

    if (codeLines.length > 1) {
      output.push("```", ...codeLines, "```");
    } else {
      output.push(...codeLines);
    }
  }

  return output.join("\n");
}

function MarkdownContent({ value }: { value: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={markdownPlugins}
      components={markdownComponents}
    >
      {withDetectedCodeBlock(value)}
    </ReactMarkdown>
  );
}

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  insert: string;
  cursorOffset: number;
  marker: string;
};

type SlashMenuState = {
  start: number;
  end: number;
  query: string;
  top: number;
  left: number;
};

const slashCommands: SlashCommand[] = [
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["h1", "title", "заголовок"],
    insert: "# ",
    cursorOffset: 2,
    marker: "H1",
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "subtitle", "заголовок"],
    insert: "## ",
    cursorOffset: 3,
    marker: "H2",
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["h3", "заголовок"],
    insert: "### ",
    cursorOffset: 4,
    marker: "H3",
  },
  {
    id: "bulleted-list",
    label: "Bulleted list",
    description: "Create a simple list",
    keywords: ["bullet", "list", "список"],
    insert: "- ",
    cursorOffset: 2,
    marker: "•",
  },
  {
    id: "numbered-list",
    label: "Numbered list",
    description: "Create an ordered list",
    keywords: ["number", "ordered", "list", "список"],
    insert: "1. ",
    cursorOffset: 3,
    marker: "1.",
  },
  {
    id: "checklist",
    label: "Checklist",
    description: "Create a task list",
    keywords: ["todo", "task", "check", "чеклист"],
    insert: "- [ ] ",
    cursorOffset: 6,
    marker: "☑",
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quote or note",
    keywords: ["blockquote", "note", "цитата"],
    insert: "> ",
    cursorOffset: 2,
    marker: "❯",
  },
  {
    id: "code-block",
    label: "Code block",
    description: "Insert a fenced code block",
    keywords: ["code", "snippet", "код"],
    insert: "\u0060\u0060\u0060\n\n\u0060\u0060\u0060",
    cursorOffset: 4,
    marker: "</>",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate content sections",
    keywords: ["line", "separator", "разделитель"],
    insert: "---\n",
    cursorOffset: 4,
    marker: "—",
  },
];

function getSlashContext(value: string, caret: number) {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)\/([^/\n]*)$/);
  if (!match || typeof match.index !== "number") return null;

  const query = match[1] ?? "";
  if (query.length > 40) return null;

  const start = beforeCaret.length - query.length - 1;
  return { start, end: caret, query };
}

function filterSlashCommands(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return slashCommands;

  return slashCommands.filter((command) =>
    [command.label, command.description, ...command.keywords]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
}

function getTextareaCaretPosition(
  textarea: HTMLTextAreaElement,
  caret: number
) {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const copiedProperties = [
    "borderBottomWidth",
    "borderLeftWidth",
    "borderRightWidth",
    "borderTopWidth",
    "boxSizing",
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "tabSize",
    "textIndent",
    "textTransform",
    "wordSpacing",
  ] as const;

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = style.width;
  mirror.style.top = "-9999px";

  for (const property of copiedProperties) {
    mirror.style[property] = style[property];
  }

  mirror.textContent = textarea.value.slice(0, caret);
  marker.textContent = textarea.value.slice(caret, caret + 1) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const position = {
    left: marker.offsetLeft - textarea.scrollLeft,
    top: marker.offsetTop - textarea.scrollTop,
    lineHeight: Number.parseFloat(style.lineHeight) || 24,
  };
  document.body.removeChild(mirror);
  return position;
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "0px";
  textarea.style.height = Math.max(180, textarea.scrollHeight) + "px";
}

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
  canEdit?: boolean;
  canDelete?: boolean;
  knowledge: {
    provider: "DISABLED" | "NATIVE" | "EXTERNAL";
    externalUrl: string | null;
    projectKey: string;
    pages: Array<{ id: string; title: string }>;
    links: Array<{
      id: string;
      documentKey: string;
      title: string;
      url: string | null;
    }>;
  };
}

const IssueDetailsClient: React.FC<IssueDetailsClientProps> = ({
  task,
  projectLabel,
  users,
  canEdit = false,
  canDelete = false,
  knowledge,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [liveTask, setLiveTask] = useState<TaskWithProjectAndReporter>(task);
  const issueKey = liveTask.key ?? liveTask.id;
  const reporterName = getDisplayName({
    user: liveTask.reporter ?? null,
    fallbackName: liveTask.requesterName ?? null,
  });
  const [titleValue, setTitleValue] = useState(liveTask.title ?? "");
  const [descriptionValue, setDescriptionValue] = useState(liveTask.description ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const originalTitleRef = useRef(titleValue);
  const originalDescriptionRef = useRef(descriptionValue);
  const skipTitleBlurRef = useRef(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const details = parseDetails(descriptionValue);
  const visibleSlashCommands = slashMenu
    ? filterSlashCommands(slashMenu.query)
    : [];
  const showCopied = (value: "key" | "link") => {
    toast.success(value === "key" ? "Issue key copied" : "Link copied");
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
    setLiveTask(task);
  }, [task]);

  useEffect(() => {
    if (
      !liveTask.projectId ||
      searchParams.get("projectId") ||
      getProjectKeyFromPathname(pathname)
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("projectId", liveTask.projectId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [liveTask.projectId, pathname, router, searchParams]);

  useBoardRealtime({
    boardId: liveTask.projectId,
    enabled: Boolean(liveTask.projectId),
    onEvent: (event) => {
      if (event.type === "task_updated" && event.payload.task.id === liveTask.id) {
        const payload = event.payload.task;
        setLiveTask((prev) => {
          const assignee =
            typeof payload.assigneeId !== "undefined"
              ? payload.assigneeId
                ? users.find((u) => u.id === payload.assigneeId) ?? null
                : null
              : prev.assignee;

          return {
            ...prev,
            key: typeof payload.key !== "undefined" ? payload.key : prev.key,
            title: typeof payload.title !== "undefined" ? payload.title : prev.title,
            description:
              typeof payload.description !== "undefined"
                ? payload.description
                : prev.description,
            type: typeof payload.type !== "undefined" ? payload.type : prev.type,
            priority:
              typeof payload.priority !== "undefined"
                ? payload.priority
                : prev.priority,
            status:
              typeof payload.status !== "undefined" ? payload.status : prev.status,
            requesterName:
              typeof payload.requesterName !== "undefined"
                ? payload.requesterName
                : prev.requesterName,
            assignee,
          };
        });
      }

      if (event.type === "task_deleted" && event.payload.taskId === liveTask.id) {
        router.refresh();
      }
    },
  });

  useEffect(() => {
    if (!editingTitle) {
      const nextTitle = liveTask.title ?? "";
      setTitleValue(nextTitle);
      originalTitleRef.current = nextTitle;
    }
  }, [liveTask.title, editingTitle]);

  useEffect(() => {
    if (!editingDescription) {
      const nextDescription = liveTask.description ?? "";
      setDescriptionValue(nextDescription);
      originalDescriptionRef.current = nextDescription;
    }
  }, [liveTask.description, editingDescription]);

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
      resizeTextarea(textarea);
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }, [editingDescription]);

  useEffect(() => {
    if (!editingDescription) {
      setSlashMenu(null);
      setActiveSlashIndex(0);
    }
  }, [editingDescription]);

  useEffect(() => {
    if (!actionsOpen) return;

    const closeActions = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsOpen(false);
    };

    window.addEventListener("mousedown", closeActions);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeActions);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen]);

  const cancelTitleEdit = () => {
    setTitleValue(originalTitleRef.current);
    setEditingTitle(false);
  };

  const cancelDescriptionEdit = () => {
    setDescriptionValue(originalDescriptionRef.current);
    setSlashMenu(null);
    setEditingDescription(false);
  };

  const syncSlashMenu = (
    value: string,
    caret: number,
    textarea: HTMLTextAreaElement
  ) => {
    const context = getSlashContext(value, caret);
    if (!context) {
      setSlashMenu(null);
      return;
    }

    const caretPosition = getTextareaCaretPosition(textarea, caret);
    const menuWidth = 288;
    setSlashMenu({
      ...context,
      top: Math.max(8, caretPosition.top + caretPosition.lineHeight + 6),
      left: Math.max(
        0,
        Math.min(caretPosition.left, textarea.clientWidth - menuWidth)
      ),
    });
    setActiveSlashIndex(0);
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (!slashMenu) return;

    const nextValue =
      descriptionValue.slice(0, slashMenu.start) +
      command.insert +
      descriptionValue.slice(slashMenu.end);
    const nextCaret = slashMenu.start + command.cursorOffset;
    setDescriptionValue(nextValue);
    setSlashMenu(null);
    setActiveSlashIndex(0);

    requestAnimationFrame(() => {
      const textarea = descriptionRef.current;
      if (!textarea) return;
      resizeTextarea(textarea);
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
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
        id: liveTask.id,
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
        id: liveTask.id,
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

  const handleDeleteTask = async () => {
    setDeleteSubmitting(true);
    try {
      const result = await deleteTaskAction(liveTask.id);
      if (!result.ok) {
        const formError = "formError" in result ? result.formError : null;
        if (isAuthRequiredError({ formError })) {
          showAuthRequiredToast();
          return;
        }
        toast.error(formError ?? "Не удалось удалить задачу.");
        return;
      }
      setDeleteConfirmOpen(false);
      router.push(
        buildProjectIssueViewHref(
          liveTask.project.key,
          "/board",
          new URLSearchParams(`projectId=${encodeURIComponent(liveTask.projectId)}`)
        )
      );
      router.refresh();
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-white/45">
          <BackButton />
          <span aria-hidden="true" className="text-white/20">
            ›
          </span>
          <button
            type="button"
            onClick={handleCopyKey}
            className="truncate rounded-md px-2 py-1 font-medium text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
            title="Copy issue key"
          >
            {issueKey}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition hover:bg-white/[0.06] hover:text-white/75"
            title="Copy link"
            aria-label="Copy issue link"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 0 1 0-7l2-2a5 5 0 1 1 7 7l-1 1" />
              <path d="M14 11a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1" />
            </svg>
          </button>

          <div ref={actionsRef} className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((current) => !current)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-lg text-white/40 transition hover:bg-white/[0.06] hover:text-white/75"
              aria-label="Issue actions"
              aria-expanded={actionsOpen}
            >
              …
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-lg border border-white/[0.1] bg-[#191c22] p-1 shadow-[0_18px_55px_rgba(0,0,0,0.6)]">
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    void handleCopyKey();
                  }}
                  className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
                >
                  Copy issue key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    void handleCopyLink();
                  }}
                  className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
                >
                  Copy link
                </button>
                {canDelete ? (
                  <>
                    <div className="my-1 h-px bg-white/[0.07]" />
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        setDeleteConfirmOpen(true);
                      }}
                      className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-xs text-red-300/80 hover:bg-red-500/10 hover:text-red-200"
                    >
                      Delete issue
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
        <main className="min-w-0 space-y-7">
          <div className="space-y-1">
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
                className="w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[24px] font-semibold leading-8 text-white outline-none focus:ring-2 focus:ring-cyan-400/25"
                disabled={savingTitle}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (canEdit) setEditingTitle(true);
                }}
                className={`w-full rounded-lg px-1 py-1 text-left text-[24px] font-semibold leading-8 text-white/95 transition focus:outline-none ${
                  canEdit
                    ? "hover:bg-white/[0.035] focus:ring-2 focus:ring-cyan-400/25"
                    : "cursor-default"
                }`}
              >
                {titleValue}
              </button>
            )}
            {savingTitle ? (
              <span className="text-xs text-white/40">Saving...</span>
            ) : null}
          </div>

          <section className="min-h-[180px]">
            {editingDescription ? (
              <div className="relative px-1 py-1">
                <textarea
                  ref={descriptionRef}
                  value={descriptionValue}
                  onChange={(event) => {
                    const textarea = event.currentTarget;
                    const nextValue = textarea.value;
                    setDescriptionValue(nextValue);
                    resizeTextarea(textarea);
                    syncSlashMenu(
                      nextValue,
                      textarea.selectionStart,
                      textarea
                    );
                  }}
                  onSelect={(event) => {
                    const textarea = event.currentTarget;
                    syncSlashMenu(
                      textarea.value,
                      textarea.selectionStart,
                      textarea
                    );
                  }}
                  onScroll={(event) => {
                    if (!slashMenu) return;
                    const textarea = event.currentTarget;
                    syncSlashMenu(
                      textarea.value,
                      textarea.selectionStart,
                      textarea
                    );
                  }}
                  spellCheck={false}
                  onKeyDown={(event) => {
                    if (slashMenu && event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveSlashIndex((current) =>
                        visibleSlashCommands.length
                          ? (current + 1) % visibleSlashCommands.length
                          : 0
                      );
                      return;
                    }
                    if (slashMenu && event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveSlashIndex((current) =>
                        visibleSlashCommands.length
                          ? (current - 1 + visibleSlashCommands.length) %
                            visibleSlashCommands.length
                          : 0
                      );
                      return;
                    }
                    if (
                      slashMenu &&
                      (event.key === "Enter" || event.key === "Tab") &&
                      visibleSlashCommands[activeSlashIndex]
                    ) {
                      event.preventDefault();
                      applySlashCommand(
                        visibleSlashCommands[activeSlashIndex]
                      );
                      return;
                    }
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void commitDescription(descriptionValue);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      if (slashMenu) {
                        setSlashMenu(null);
                        return;
                      }
                      cancelDescriptionEdit();
                    }
                  }}
                  onBlur={() => {
                    setSlashMenu(null);
                    void commitDescription(descriptionValue);
                  }}
                  className="block min-h-[180px] w-full resize-none overflow-hidden bg-transparent text-[15px] leading-7 text-white/82 outline-none"
                  rows={1}
                  disabled={savingDescription}
                  aria-label="Issue description"
                  aria-controls={slashMenu ? "description-slash-menu" : undefined}
                />

                {slashMenu ? (
                  <div
                    id="description-slash-menu"
                    role="listbox"
                    aria-label="Formatting commands"
                    className="absolute z-30 max-h-[320px] w-72 overflow-y-auto rounded-lg border border-white/[0.1] bg-[#191c22] p-1 shadow-[0_20px_60px_rgba(0,0,0,0.58)]"
                    style={{ top: slashMenu.top, left: slashMenu.left }}
                  >
                    <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">
                      Commands
                    </div>
                    {visibleSlashCommands.length ? (
                      visibleSlashCommands.map((command, index) => (
                        <button
                          key={command.id}
                          type="button"
                          role="option"
                          aria-selected={index === activeSlashIndex}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveSlashIndex(index)}
                          onClick={() => applySlashCommand(command)}
                          className={[
                            "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition",
                            index === activeSlashIndex
                              ? "bg-white/[0.08]"
                              : "hover:bg-white/[0.05]",
                          ].join(" ")}
                        >
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.035] font-mono text-[10px] text-white/60">
                            {command.marker}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-white/80">
                              {command.label}
                            </span>
                            <span className="block truncate text-[11px] text-white/35">
                              {command.description}
                            </span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-2.5 py-3 text-xs text-white/35">
                        No matching commands
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-1 text-[11px] text-white/25">
                  Type / for commands · Ctrl/Cmd + Enter to save · Esc to cancel
                </div>
              </div>
            ) : (
              <div
                className={[
                  "relative rounded-lg px-1 py-1 outline-none",
                  canEdit
                    ? "cursor-text focus:ring-2 focus:ring-cyan-400/20"
                    : "",
                ].join(" ")}
                onClick={(event) => {
                  if (!canEdit) return;
                  if (
                    event.target instanceof Element &&
                    event.target.closest("a, button")
                  ) {
                    return;
                  }
                  setEditingDescription(true);
                }}
                onKeyDown={(event) => {
                  if (
                    canEdit &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    setEditingDescription(true);
                  }
                }}
                tabIndex={canEdit ? 0 : undefined}
                role={canEdit ? "textbox" : undefined}
                aria-label={canEdit ? "Edit issue description" : undefined}
                aria-readonly={canEdit ? true : undefined}
                aria-multiline={canEdit ? true : undefined}
              >
                {!isEmptyValue(details.description) ? (
                  <MarkdownContent value={cleanSummary(details.description)} />
                ) : null}

                {!isEmptyValue(details.environment) ? (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-xs font-medium text-white/45">Environment</h3>
                    <MarkdownContent value={details.environment ?? ""} />
                  </div>
                ) : null}

                {stepsList.length ? (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-xs font-medium text-white/45">Steps</h3>
                    <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-7 text-white/82">
                      {stepsList.map((step, index) => (
                        <li key={`${step}-${index}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {!isEmptyValue(details.expected) ? (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-xs font-medium text-white/45">Expected</h3>
                    <MarkdownContent value={details.expected ?? ""} />
                  </div>
                ) : null}

                {!isEmptyValue(details.actual) ? (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-xs font-medium text-white/45">Actual</h3>
                    <MarkdownContent value={details.actual ?? ""} />
                  </div>
                ) : null}

                {isEmptyValue(details.description) &&
                isEmptyValue(details.environment) &&
                stepsList.length === 0 &&
                isEmptyValue(details.expected) &&
                isEmptyValue(details.actual) ? (
                  <p className="text-sm text-white/35">Add description...</p>
                ) : null}
              </div>
            )}
            {savingDescription ? (
              <span className="mt-2 block text-xs text-white/40">Saving...</span>
            ) : null}
          </section>

          {liveTask.attachments.length ? (
            <section className="border-t border-white/[0.07] pt-5">
              <h2 className="mb-3 text-xs font-medium text-white/45">
                Attachments
              </h2>
              <ul className="flex flex-wrap gap-2">
                {liveTask.attachments.map((file) => (
                  <li key={file}>
                    <a
                      href={file}
                      className="inline-flex h-9 max-w-[280px] items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-white/65 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span className="truncate">{attachmentLabel(file)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {knowledge.projectKey ? (
            <TaskKnowledgePanel
              taskId={liveTask.id}
              projectKey={knowledge.projectKey}
              provider={knowledge.provider}
              externalUrl={knowledge.externalUrl}
              pages={knowledge.pages}
              links={knowledge.links}
              canEdit={canEdit}
            />
          ) : null}
        </main>

        <div className="h-fit lg:sticky lg:top-20">
          <IssueMetaPanel
            id={liveTask.id}
            projectLabel={projectLabel ?? null}
            status={liveTask.status}
            priority={liveTask.priority}
            environment={details.environment}
            reporterName={reporterName}
            assigneeId={liveTask.assignee?.id ?? null}
            tags={liveTask.tags}
            typeLabel={details.type ?? liveTask.type ?? null}
            users={users}
            canEdit={canEdit}
            createdAt={liveTask.createdAt}
            updatedAt={liveTask.createdAt}
          />
        </div>
      </div>
      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <Card className="w-full max-w-md space-y-4 border border-white/12 bg-[rgba(12,16,28,0.96)] p-5">
            <h3 className="text-base font-semibold text-white">Удалить задачу?</h3>
            <p className="text-sm text-white/75">
              Она попадёт в Корзину и её можно будет восстановить.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteSubmitting}
                className="rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/8"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteTask()}
                disabled={deleteSubmitting}
                className="rounded-md bg-red-500/85 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
              >
                {deleteSubmitting ? "Удаляем..." : "Удалить"}
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export default IssueDetailsClient;
