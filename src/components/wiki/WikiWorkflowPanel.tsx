"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/toast";
import { updateWikiWorkflowAction } from "@/server/knowledge/actions";

export type WikiWorkflowStatusValue = "DRAFT" | "IN_REVIEW" | "APPROVED";

type ReviewDecision = {
  id: string;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  comment: string | null;
  createdAt: string;
  version: number;
  reviewerName: string | null;
};

type WikiWorkflowPanelProps = {
  pageId: string;
  status: WikiWorkflowStatusValue;
  reviewVersion: number | null;
  approvedVersion: number | null;
  requestedByName: string | null;
  requestedAt: string | null;
  canEdit: boolean;
  canApprove: boolean;
  decisions: ReviewDecision[];
};

const statusLabels: Record<WikiWorkflowStatusValue, string> = {
  DRAFT: "Черновик",
  IN_REVIEW: "На проверке",
  APPROVED: "Утверждено",
};

export default function WikiWorkflowPanel({
  pageId,
  status,
  reviewVersion,
  approvedVersion,
  requestedByName,
  requestedAt,
  canEdit,
  canApprove,
  decisions,
}: WikiWorkflowPanelProps) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const runAction = async (
    action: "SUBMIT" | "APPROVE" | "REQUEST_CHANGES"
  ) => {
    setSubmitting(true);
    const result = await updateWikiWorkflowAction({
      pageId,
      action,
      comment: comment || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error("Не удалось обновить документ", result.formError);
      return;
    }
    setComment("");
    toast.success(
      action === "SUBMIT"
        ? "Документ отправлен на проверку"
        : action === "APPROVE"
          ? "Версия утверждена"
          : "Запрошены изменения"
    );
    router.refresh();
  };

  return (
    <section className="surface rounded-[var(--radius-md)] p-4" aria-label="Статус документа">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              status === "APPROVED"
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
                : status === "IN_REVIEW"
                  ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                  : "border-white/10 bg-white/5 text-white/60"
            }`}
          >
            {statusLabels[status]}
          </span>
          {status === "IN_REVIEW" ? (
            <span className="text-xs text-white/40">
              Версия {reviewVersion}
              {requestedByName ? ` · ${requestedByName}` : ""}
              {requestedAt
                ? ` · ${new Date(requestedAt).toLocaleString("ru-RU")}`
                : ""}
            </span>
          ) : null}
          {approvedVersion ? (
            <span className="text-xs text-white/40">
              Последняя утверждённая версия: {approvedVersion}
            </span>
          ) : null}
        </div>
        {canEdit && status !== "IN_REVIEW" ? (
          <Button onClick={() => runAction("SUBMIT")} disabled={submitting}>
            {submitting ? "Отправляем…" : "Отправить на проверку"}
          </Button>
        ) : null}
      </div>

      {canApprove && status === "IN_REVIEW" ? (
        <div className="mt-4 space-y-3 border-t border-white/6 pt-4">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="input min-h-24 w-full resize-y py-2"
            placeholder="Комментарий к решению (для запроса изменений обязателен)"
            maxLength={20_000}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => runAction("REQUEST_CHANGES")}
              disabled={submitting || !comment.trim()}
            >
              Запросить изменения
            </Button>
            <Button onClick={() => runAction("APPROVE")} disabled={submitting}>
              Утвердить версию {reviewVersion}
            </Button>
          </div>
        </div>
      ) : null}

      {decisions.length > 0 ? (
        <details className="mt-4 border-t border-white/6 pt-3">
          <summary className="cursor-pointer text-xs text-white/50">
            История согласований ({decisions.length})
          </summary>
          <div className="mt-3 space-y-3">
            {decisions.map((decision) => (
              <div key={decision.id} className="text-xs text-white/55">
                <span className="font-medium text-white/75">
                  {decision.decision === "APPROVED"
                    ? "Утверждена"
                    : "Возвращена"}{" "}
                  версия {decision.version}
                </span>{" "}
                · {decision.reviewerName ?? "Неизвестный пользователь"} ·{" "}
                {new Date(decision.createdAt).toLocaleString("ru-RU")}
                {decision.comment ? (
                  <p className="mt-1 whitespace-pre-wrap text-white/65">
                    {decision.comment}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
