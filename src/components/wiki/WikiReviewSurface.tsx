"use client";

import { type ReactNode, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import {
  addWikiCommentReplyAction,
  createWikiCommentThreadAction,
  resolveWikiCommentThreadAction,
} from "@/server/knowledge/actions";

export type WikiCommentThreadView = {
  id: string;
  revisionVersion: number;
  anchorQuote: string | null;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  createdByName: string | null;
  resolvedAt: string | null;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }>;
};

type WikiReviewSurfaceProps = {
  pageId: string;
  currentMarkdown: string;
  canComment: boolean;
  threads: WikiCommentThreadView[];
  children: ReactNode;
};

function normalizedText(value: string) {
  return value
    .replace(/[#*_>`[\]()~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export default function WikiReviewSurface({
  pageId,
  currentMarkdown,
  canComment,
  threads,
  children,
}: WikiReviewSurfaceProps) {
  const router = useRouter();
  const documentRef = useRef<HTMLDivElement>(null);
  const [selectedQuote, setSelectedQuote] = useState("");
  const [newComment, setNewComment] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState("");
  const normalizedMarkdown = normalizedText(currentMarkdown);

  const captureSelection = () => {
    if (!canComment) return;
    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !documentRef.current?.contains(selection.anchorNode) ||
      !documentRef.current?.contains(selection.focusNode)
    ) {
      return;
    }
    const quote = selection.toString().replace(/\s+/g, " ").trim().slice(0, 2_000);
    if (quote) setSelectedQuote(quote);
  };

  const createThread = async (anchorQuote: string | null) => {
    if (!newComment.trim()) return;
    setBusyKey("new");
    const result = await createWikiCommentThreadAction({
      pageId,
      body: newComment,
      anchorQuote,
    });
    setBusyKey("");
    if (!result.ok) {
      toast.error("Не удалось добавить комментарий", result.formError);
      return;
    }
    setNewComment("");
    setSelectedQuote("");
    toast.success("Комментарий добавлен");
    router.refresh();
  };

  const reply = async (threadId: string) => {
    const body = replyBodies[threadId]?.trim();
    if (!body) return;
    setBusyKey(threadId);
    const result = await addWikiCommentReplyAction({ threadId, body });
    setBusyKey("");
    if (!result.ok) {
      toast.error("Не удалось добавить ответ", result.formError);
      return;
    }
    setReplyBodies((current) => ({ ...current, [threadId]: "" }));
    router.refresh();
  };

  const setResolved = async (threadId: string, resolved: boolean) => {
    setBusyKey(threadId);
    const result = await resolveWikiCommentThreadAction({ threadId, resolved });
    setBusyKey("");
    if (!result.ok) {
      toast.error("Не удалось обновить обсуждение", result.formError);
      return;
    }
    router.refresh();
  };

  const openThreads = threads.filter((thread) => thread.status === "OPEN");
  const resolvedThreads = threads.filter((thread) => thread.status === "RESOLVED");

  return (
    <>
      <div ref={documentRef} onMouseUp={captureSelection}>
        {children}
      </div>

      {canComment ? (
        <section className="mt-6 border-t border-white/6 pt-5" aria-label="Новое обсуждение">
          {selectedQuote ? (
            <div className="mb-3 rounded-md border border-cyan-300/15 bg-cyan-300/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <blockquote className="line-clamp-3 text-xs text-cyan-100/70">
                  {selectedQuote}
                </blockquote>
                <button
                  type="button"
                  className="text-xs text-white/40 hover:text-white/70"
                  onClick={() => setSelectedQuote("")}
                >
                  Убрать цитату
                </button>
              </div>
            </div>
          ) : (
            <p className="mb-2 text-xs text-white/40">
              Выделите текст документа, чтобы оставить точечное замечание.
            </p>
          )}
          <textarea
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            className="input min-h-24 w-full resize-y py-2"
            placeholder={selectedQuote ? "Комментарий к выделенному тексту" : "Комментарий к странице"}
            maxLength={20_000}
          />
          <div className="mt-2 flex justify-end">
            <Button
              onClick={() => createThread(selectedQuote || null)}
              disabled={busyKey === "new" || !newComment.trim()}
            >
              {busyKey === "new" ? "Добавляем…" : "Комментировать"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mt-6 border-t border-white/6 pt-5" aria-label="Обсуждения документа">
        <h2 className="text-sm font-semibold text-white">
          Открытые замечания · {openThreads.length}
        </h2>
        {openThreads.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">Открытых замечаний нет.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {openThreads.map((thread) => {
              const anchorPresent = thread.anchorQuote
                ? normalizedMarkdown.includes(normalizedText(thread.anchorQuote))
                : true;
              return (
                <article key={thread.id} className="rounded-md border border-white/8 bg-white/[0.025] p-3">
                  {thread.anchorQuote ? (
                    <blockquote className="mb-3 border-l-2 border-cyan-300/30 pl-3 text-xs text-white/55">
                      {thread.anchorQuote}
                      {!anchorPresent ? (
                        <span className="mt-1 block text-amber-200/70">
                          Привязка потеряна после редактирования документа
                        </span>
                      ) : null}
                    </blockquote>
                  ) : null}
                  <div className="space-y-2">
                    {thread.comments.map((comment) => (
                      <div key={comment.id} className="text-sm text-white/75">
                        <div className="text-xs text-white/35">
                          {comment.authorName ?? "Неизвестный пользователь"} ·{" "}
                          {new Date(comment.createdAt).toLocaleString("ru-RU")}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                  {canComment ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={replyBodies[thread.id] ?? ""}
                        onChange={(event) =>
                          setReplyBodies((current) => ({
                            ...current,
                            [thread.id]: event.target.value,
                          }))
                        }
                        className="input min-w-0 flex-1"
                        placeholder="Ответить…"
                        maxLength={20_000}
                      />
                      <Button
                        variant="ghost"
                        onClick={() => reply(thread.id)}
                        disabled={busyKey === thread.id || !(replyBodies[thread.id] ?? "").trim()}
                      >
                        Ответить
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setResolved(thread.id, true)}
                        disabled={busyKey === thread.id}
                      >
                        Закрыть
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {resolvedThreads.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-white/45">
              Закрытые обсуждения ({resolvedThreads.length})
            </summary>
            <div className="mt-3 space-y-2">
              {resolvedThreads.map((thread) => (
                <article key={thread.id} className="rounded-md border border-white/6 p-3 text-sm text-white/45">
                  {thread.anchorQuote ? (
                    <blockquote className="mb-2 line-clamp-2 border-l-2 border-white/10 pl-3 text-xs">
                      {thread.anchorQuote}
                    </blockquote>
                  ) : null}
                  <p className="whitespace-pre-wrap">
                    {thread.comments.at(-1)?.body}
                  </p>
                  {canComment ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-cyan-300 hover:text-cyan-200"
                      onClick={() => setResolved(thread.id, false)}
                      disabled={busyKey === thread.id}
                    >
                      Переоткрыть
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </>
  );
}
