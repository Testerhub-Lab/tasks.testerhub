"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Textarea from "../ui/Textarea";
import { addCommentAction } from "../../server/actions/tasks";
import { formatDate } from "../issues/utils";

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

type PendingState = "pending" | "failed";

type PendingComment = {
  clientId: string;
  taskId: string;
  text: string;
  authorName?: string;
  createdAt: Date;
  state: PendingState;
  error?: string;
};

interface TaskCommentsProps {
  taskId: string;
  comments: CommentItem[];
}

const isNearBottom = (el: HTMLElement, thresholdPx = 80) => {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= thresholdPx;
};

const emailPrefix = (email?: string | null) => {
  if (!email) return null;
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
};

const TaskComments: React.FC<TaskCommentsProps> = ({ taskId, comments }) => {
  const router = useRouter();

  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isFocused, setFocused] = useState(false);

  const [pending, setPending] = useState<PendingComment[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  const displayed = useMemo(() => {
    const serverAsList = comments.map((c) => {
      const displayName =
        c.user?.name ?? c.authorName ?? emailPrefix(c.user?.email) ?? "Anonymous";

      return {
        id: c.id,
        authorName: displayName,
        text: c.text,
        createdAt: c.createdAt,
        _state: undefined as undefined,
        _error: undefined as undefined,
        _clientId: undefined as undefined,
      };
    });

    const pendingAsList = pending.map((p) => ({
      id: `pending:${p.clientId}`,
      authorName: p.authorName || "Anonymous",
      text: p.text,
      createdAt: p.createdAt,
      _state: p.state,
      _error: p.error,
      _clientId: p.clientId,
    }));

    return [...serverAsList, ...pendingAsList];
  }, [comments, pending]);

  const scrollToBottomIfNeeded = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (!isNearBottom(el)) return;

    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [displayed.length, scrollToBottomIfNeeded]);

  const submit = useCallback(
    async (override?: { text?: string; authorName?: string; clientId?: string }) => {
      const nextText = (override?.text ?? text).trim();
      const nextAuthor = (override?.authorName ?? authorName).trim();

      if (!nextText) return;

      const clientId =
        override?.clientId ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`;

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

      try {
        const result = await addCommentAction({
          taskId,
          text: nextText,
          authorName: nextAuthor || undefined,
        });

        if (!result.ok) {
          setPending((prev) =>
            prev.map((p) =>
              p.clientId === clientId
                ? { ...p, state: "failed", error: result.formError ?? "Failed to send." }
                : p
            )
          );
          return;
        }

        setPending((prev) => prev.filter((p) => p.clientId !== clientId));
        router.refresh();
      } catch (e) {
        console.error(e);
        setPending((prev) =>
          prev.map((p) =>
            p.clientId === clientId ? { ...p, state: "failed", error: "Failed to send." } : p
          )
        );
      }
    },
    [authorName, router, taskId, text]
  );

  const retry = useCallback(
    (clientId: string) => {
      const item = pending.find((p) => p.clientId === clientId);
      if (!item) return;

      setPending((prev) =>
        prev.map((p) =>
          p.clientId === clientId ? { ...p, state: "pending", error: undefined } : p
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

  return (
    <div className="space-y-3">
      <div ref={listRef} className="max-h-[420px] space-y-3 overflow-auto pr-1">
        {displayed.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-secondary)]">
              No comments yet. Be the first.
            </p>
          </Card>
        ) : (
          displayed.map((c) => (
            <Card
              key={c.id}
              className={[
                "space-y-2",
                c._state === "pending" ? "opacity-70" : "",
                c._state === "failed" ? "border border-[var(--color-error)]/40" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
                <span>{c.authorName}</span>
                <span className="flex items-center gap-2">
                  {c._state === "pending" ? <span>Sending…</span> : null}
                  {c._state === "failed" ? (
                    <span className="text-[var(--color-error)]">Failed</span>
                  ) : null}
                  <span>{formatDate(c.createdAt)}</span>
                </span>
              </div>

              <p className="whitespace-pre-wrap text-sm text-[var(--color-text)]">{c.text}</p>

              {c._state === "failed" ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--color-error)]">{c._error ?? "Failed to send."}</div>
                  <Button type="button" variant="secondary" onClick={() => retry(c._clientId)}>
                    Retry
                  </Button>
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>

      <Card className="space-y-3">
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

        {isFocused ? (
          <>
            <Input
              type="text"
              name="authorName"
              placeholder="Your name (optional)"
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--color-text-secondary)]">
                Ctrl/Cmd + Enter to send • Esc to cancel
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={cancel}>
                  Cancel
                </Button>
                <Button type="button" variant="primary" disabled={!text.trim()} onClick={() => void submit()}>
                  Send
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex justify-end">
            <Button type="button" variant="primary" disabled={!text.trim()} onClick={() => void submit()}>
              Send
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default TaskComments;
