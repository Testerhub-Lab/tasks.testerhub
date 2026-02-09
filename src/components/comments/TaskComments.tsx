"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Textarea from "../ui/Textarea";
import { addCommentAction } from "../../server/actions/tasks";
import { formatDate, getStatusLabel } from "../issues/utils";
import { getDisplayName } from "../../server/auth/displayName";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";
import type { TaskStatus } from "../../server/validators/task";

type CommentItem = {
  id: string;
  taskId: string;
  text: string;
  userId: string | null;
  authorName: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type TaskActivityItem = {
  id: string;
  type: "CREATED" | "STATUS_CHANGED";
  createdAt: Date;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  authorName: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type PendingState = "pending" | "sent" | "failed";

type PendingComment = {
  clientId: string;
  taskId: string;
  text: string;
  authorName?: string;
  createdAt: Date;
  state: PendingState;
  error?: string;
};

type ActivityItem =
  | {
      kind: "created";
      id: string;
      createdAt: Date;
      title: string;
      subtitle?: string;
      authorName?: string | null;
    }
  | {
      kind: "comment";
      id: string;
      createdAt: Date;
      authorName: string;
      text: string;
      state?: PendingState;
      error?: string;
      clientId?: string;
    }
  | {
      kind: "status";
      id: string;
      createdAt: Date;
      authorName: string;
      fromStatus: TaskStatus;
      toStatus: TaskStatus;
    }
  | {
      kind: "empty";
      id: string;
      createdAt: Date;
      text: string;
    };

interface TaskCommentsProps {
  taskId: string;
  issueKey: string;
  createdAt: Date;
  comments: CommentItem[];
  activities: TaskActivityItem[];
}

const isNearBottom = (el: HTMLElement, thresholdPx = 80) => {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= thresholdPx;
};

const makeClientId = () =>
  `${Date.now()}_${Math.random().toString(16).slice(2)}`;

const TaskComments: React.FC<TaskCommentsProps> = ({
  taskId,
  issueKey,
  createdAt,
  comments,
  activities,
}) => {
  const router = useRouter();

  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isFocused, setFocused] = useState(false);

  const [pending, setPending] = useState<PendingComment[]>([]);
  const [isSubmitting, setSubmitting] = useState(false);
  const [view, setView] = useState<"all" | "comments">("all");

  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const setHighlight = useCallback((id: string) => {
    setHighlightId(id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // 1) Hash #activity — мягко скроллим к Activity (если браузер сам не успел/не смог)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#activity") return;
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const activity: ActivityItem[] = useMemo(() => {
    const createdActivity = activities.find((a) => a.type === "CREATED") ?? null;
    const created: ActivityItem = {
      kind: "created",
      id: "created",
      createdAt: createdActivity?.createdAt ?? createdAt,
      title: `Issue created`,
      subtitle: issueKey,
      authorName: createdActivity
        ? getDisplayName({
            user: createdActivity.user,
            fallbackName: createdActivity.authorName,
          })
        : null,
    };

    const statusEvents: ActivityItem[] = activities
      .filter((a) => a.type === "STATUS_CHANGED" && a.fromStatus && a.toStatus)
      .map((a) => ({
        kind: "status",
        id: a.id,
        createdAt: a.createdAt,
        authorName: getDisplayName({
          user: a.user,
          fallbackName: a.authorName,
        }),
        fromStatus: a.fromStatus!,
        toStatus: a.toStatus!,
      }));

    const serverComments: ActivityItem[] = comments.map((c) => {
      const displayName = getDisplayName({
        user: c.user,
        fallbackName: c.authorName,
      });
      return {
        kind: "comment",
        id: c.id,
        createdAt: c.createdAt,
        authorName: displayName,
        text: c.text,
      };
    });

    const pendingComments: ActivityItem[] = pending.map((p) => ({
      kind: "comment",
      id: `pending:${p.clientId}`,
      createdAt: p.createdAt,
      authorName: getDisplayName({
        user: null,
        fallbackName: p.authorName ?? null,
      }),
      text: p.text,
      state: p.state,
      error: p.error,
      clientId: p.clientId,
    }));

    const hasAnyComments =
      serverComments.length > 0 || pendingComments.length > 0 || statusEvents.length > 0;

    const empty: ActivityItem | null = hasAnyComments
      ? null
      : {
          kind: "empty",
          id: "empty",
          createdAt: createdAt,
          text: "No comments yet. Be the first to comment.",
        };

    const merged = [created, ...statusEvents, ...serverComments, ...pendingComments].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    return empty ? [created, empty, ...merged.slice(1)] : merged;
  }, [activities, comments, createdAt, issueKey, pending]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // 2) При добавлении/обновлении ленты — если пользователь “у низа”, докручиваем
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!isNearBottom(el)) return;
    requestAnimationFrame(() => scrollToBottom("smooth"));
  }, [activity.length, scrollToBottom]);

  const submit = useCallback(
    async (override?: {
      text?: string;
      authorName?: string;
      clientId?: string;
    }) => {
      const nextText = (override?.text ?? text).trim();
      const nextAuthor = (override?.authorName ?? authorName).trim();
      if (!nextText) return;

      const clientId = override?.clientId ?? makeClientId();

      const el = listRef.current;
      const shouldAutoScroll = el ? isNearBottom(el) : true;

      const optimistic: PendingComment = {
        clientId,
        taskId,
        text: nextText,
        authorName: nextAuthor || undefined,
        createdAt: new Date(),
        state: "pending",
      };

      setPending((prev) => [...prev, optimistic]);
      setText("");
      setAuthorName("");
      setFocused(false);

      const optimisticDomId = `pending:${clientId}`;
      setHighlight(optimisticDomId);
      if (shouldAutoScroll) {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      }

      setSubmitting(true);
      try {
        const result = await addCommentAction({
          taskId,
          text: nextText,
          authorName: nextAuthor || undefined,
        });

        if (!result.ok) {
          if (isAuthRequiredError({ formError: result.formError ?? null })) {
            showAuthRequiredToast();
            setPending((prev) => prev.filter((p) => p.clientId !== clientId));
            return;
          }
          setPending((prev) =>
            prev.map((p) =>
              p.clientId === clientId
                ? {
                    ...p,
                    state: "failed",
                    error: result.formError ?? "Failed to send.",
                  }
                : p
            )
          );
          return;
        }

        setPending((prev) =>
          prev.map((p) =>
            p.clientId === clientId ? { ...p, state: "sent" } : p
          )
        );

        router.refresh();

        setTimeout(() => {
          setPending((prev) => prev.filter((p) => p.clientId !== clientId));
        }, 500);
      } catch (e) {
        console.error(e);
        setPending((prev) =>
          prev.map((p) =>
            p.clientId === clientId
              ? { ...p, state: "failed", error: "Failed to send." }
              : p
          )
        );
      } finally {
        setSubmitting(false);
      }
    },
    [authorName, router, scrollToBottom, setHighlight, taskId, text]
  );

  const retry = useCallback(
    (clientId: string) => {
      const item = pending.find((p) => p.clientId === clientId);
      if (!item) return;

      setPending((prev) =>
        prev.map((p) =>
          p.clientId === clientId
            ? { ...p, state: "pending", error: undefined }
            : p
        )
      );

      void submit({ text: item.text, authorName: item.authorName, clientId });
    },
    [pending, submit]
  );

  const cancel = () => {
    setText("");
    setAuthorName("");
    setFocused(false);
  };

  const activityCount = activity.filter((item) => item.kind !== "empty").length;
  const commentCount = activity.filter((item) => item.kind === "comment").length;
  const visibleActivity =
    view === "comments"
      ? activity.filter((item) => item.kind === "comment")
      : activity;

  return (
    <Card ref={rootRef} className="space-y-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white/70">
          <button
            type="button"
            onClick={() => setView("all")}
            className={[
              "rounded-md px-2 py-1 text-xs transition-colors",
              view === "all" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5",
            ].join(" ")}
          >
            Activity · {activityCount}
          </button>
          <button
            type="button"
            onClick={() => setView("comments")}
            className={[
              "rounded-md px-2 py-1 text-xs transition-colors",
              view === "comments" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5",
            ].join(" ")}
          >
            Comments · {commentCount}
          </button>
        </div>
        {pending.length ? (
          <div className="text-xs text-white/40">+{pending.length} local</div>
        ) : null}
      </div>

      {/* Feed */}
      <div ref={listRef} className="max-h-[360px] overflow-auto pr-2">
        <div className="divide-y divide-white/10">
          {visibleActivity.length === 0 ? (
            <div className="py-2">
              <div className="text-sm text-[var(--color-text-secondary)]">
                No comments yet.
              </div>
            </div>
          ) : null}
          {visibleActivity.map((item) => {
            if (item.kind === "created") {
              return (
                <div key={item.id} className="py-2">
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    <span className="text-[var(--color-text)]">
                      {item.authorName ?? "System"}
                    </span>
                    <span className="mx-2 text-white/20">•</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 text-sm text-[var(--color-text)]">
                    {item.title}
                    {item.subtitle ? (
                      <span className="ml-2 text-[var(--color-text-secondary)]">
                        ({item.subtitle})
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            }

            if (item.kind === "empty") {
              return (
                <div key={item.id} className="py-2">
                  <div className="text-sm text-[var(--color-text-secondary)]">
                    {item.text}
                  </div>
                </div>
              );
            }

            if (item.kind === "status") {
              return (
                <div key={item.id} className="py-2">
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    <span className="text-[var(--color-text)]">
                      {item.authorName}
                    </span>
                    <span className="mx-2 text-white/20">•</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 text-sm text-[var(--color-text)]">
                    Status changed from{" "}
                    <span className="text-white/70">
                      {getStatusLabel(item.fromStatus)}
                    </span>{" "}
                    to{" "}
                    <span className="text-white/70">
                      {getStatusLabel(item.toStatus)}
                    </span>
                  </div>
                </div>
              );
            }

            const rowId = item.id;
            const isHighlighted = highlightId === rowId;

            return (
              <div
                key={rowId}
                className={[
                  "py-2 transition-colors",
                  item.state === "pending" ? "opacity-70" : "",
                  item.state === "failed" ? "bg-white/[0.02]" : "",
                  isHighlighted ? "bg-white/[0.04]" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    <span className="text-[var(--color-text)]">
                      {item.authorName}
                    </span>
                    <span className="mx-2 text-white/20">•</span>
                    <span>{formatDate(item.createdAt)}</span>

                    {item.state === "pending" ? (
                      <>
                        <span className="mx-2 text-white/20">•</span>
                        <span>Sending…</span>
                      </>
                    ) : null}

                    {item.state === "sent" ? (
                      <>
                        <span className="mx-2 text-white/20">•</span>
                        <span>Sent</span>
                      </>
                    ) : null}

                    {item.state === "failed" ? (
                      <>
                        <span className="mx-2 text-white/20">•</span>
                        <span className="text-[var(--color-error)]">Failed</span>
                      </>
                    ) : null}
                  </div>

                  {item.state === "failed" && item.clientId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => retry(item.clientId!)}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>

                <div className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--color-text)]">
                  {item.text}
                </div>

                {item.state === "failed" ? (
                  <div className="mt-2 text-xs text-[var(--color-error)]">
                    {item.error ?? "Failed to send."}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10" />

      {/* Composer */}
      <div className="space-y-2">
        <Textarea
          name="text"
          placeholder="Add a comment…"
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />

        {isFocused || authorName.trim() ? (
          <Input
            type="text"
            name="authorName"
            placeholder="Your name (optional)"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
          />
        ) : null}

        <div className="flex items-center justify-between">
          <div className="text-xs text-[var(--color-text-secondary)]">
            Ctrl/Cmd + Enter to send • Esc to cancel
          </div>

          <div className="flex gap-2">
            {isFocused ? (
              <Button type="button" variant="secondary" onClick={cancel}>
                Cancel
              </Button>
            ) : null}

            <Button
              type="button"
              variant="primary"
              disabled={isSubmitting || !text.trim()}
              onClick={() => void submit()}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TaskComments;
