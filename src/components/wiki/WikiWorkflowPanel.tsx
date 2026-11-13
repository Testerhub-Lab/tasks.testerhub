"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  assignee: { id: string; name: string | null; email: string } | null;
  reviewers: Array<{ id: string; name: string | null; email: string }>;
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
  assignee,
  reviewers,
  canEdit,
  canApprove,
  decisions,
}: WikiWorkflowPanelProps) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [reviewerId, setReviewerId] = useState(assignee?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const runAction = async (
    action: "SUBMIT" | "ASSIGN_REVIEWER" | "APPROVE" | "REQUEST_CHANGES"
  ) => {
    const rejectionComment =
      action === "REQUEST_CHANGES"
        ? window.prompt("Комментарий к отклонению")
        : null;
    if (action === "REQUEST_CHANGES" && !rejectionComment?.trim()) return;
    setSubmitting(true);
    const result = await updateWikiWorkflowAction({
      pageId,
      action,
      assigneeId: reviewerId || assignee?.id || null,
      comment: rejectionComment || comment || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error("Не удалось обновить документ", result.formError);
      return;
    }
    setComment("");
    setPickerOpen(false);
    toast.success(
      action === "SUBMIT"
        ? "Документ отправлен на проверку"
        : action === "ASSIGN_REVIEWER"
          ? "Согласующий назначен"
        : action === "APPROVE"
          ? "Версия утверждена"
          : "Запрошены изменения"
    );
    router.refresh();
  };

  const assigneeLabel = assignee?.name || assignee?.email || "Согласующий";
  const assigneeInitials = assigneeLabel.slice(0, 2).toUpperCase();

  return (
    <section className="min-w-0" aria-label="Статус документа">
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
              Утверждена v{approvedVersion}
            </span>
          ) : null}
          {assignee ? (
            <span
              className="inline-flex size-7 items-center justify-center rounded-full bg-cyan-300/15 text-[10px] font-semibold text-cyan-100"
              title={assigneeLabel}
            >
              {assigneeInitials}
            </span>
          ) : null}
          {canEdit ? (
            <span className="relative">
              <button
                type="button"
                className="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-white/5 text-sm text-white/65 hover:bg-white/8 hover:text-white"
                onClick={() => setPickerOpen((current) => !current)}
                aria-label="Назначить согласующего"
                aria-expanded={pickerOpen}
              >
                +
              </button>
              {pickerOpen ? (
                <span className="absolute right-0 z-30 mt-2 block w-64 rounded-[var(--radius-md)] border border-white/10 bg-[var(--surface-popover)] p-2 shadow-xl">
                  <select
                    className="input"
                    value={reviewerId}
                    onChange={(event) => setReviewerId(event.target.value)}
                    aria-label="Согласующий"
                  >
                    <option value="">Выберите согласующего</option>
                    {reviewers.map((reviewer) => (
                      <option key={reviewer.id} value={reviewer.id}>
                        {reviewer.name || reviewer.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button button--primary mt-2 w-full"
                    disabled={submitting || !reviewerId}
                    onClick={() =>
                      runAction(status === "IN_REVIEW" ? "ASSIGN_REVIEWER" : "SUBMIT")
                    }
                  >
                    {status === "IN_REVIEW" ? "Назначить" : "На согласование"}
                  </button>
                </span>
              ) : null}
            </span>
          ) : null}
          {canApprove && status === "IN_REVIEW" ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/18"
                onClick={() => runAction("APPROVE")}
                disabled={submitting}
                aria-label={`Утвердить версию ${reviewVersion}`}
                title={`Утвердить версию ${reviewVersion}`}
              >
                ✓
              </button>
              <button
                type="button"
                className="grid size-7 place-items-center rounded-[var(--radius-sm)] bg-red-300/10 text-red-200 hover:bg-red-300/18"
                onClick={() => runAction("REQUEST_CHANGES")}
                disabled={submitting}
                aria-label="Отклонить"
                title="Отклонить"
              >
                ×
              </button>
            </span>
          ) : null}
          </div>

      {decisions.length > 0 ? (
        <details className="mt-2">
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
