import { TASK_TYPE_LABEL, type TaskType } from "@/shared/taskEnums";

export default function IssueTypeBadge({ type, iconOnly = false }: { type: string; iconOnly?: boolean }) {
  const value = type.trim().toUpperCase();
  const label = TASK_TYPE_LABEL[value as TaskType] ?? type;
  return (
    <span className="issue-type inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      data-type={value} title={iconOnly ? label : undefined}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        {value === "BUG" ? <path d="M5 5.5A3 3 0 0 1 8 3a3 3 0 0 1 3 2.5V10a3 3 0 1 1-6 0V5.5ZM2 6h3m6 0h3M2 9h3m6 0h3M8 6v6M6 1.5l1 2m3-2-1 2" />
          : value === "EPIC" ? <path d="m8 2 6 3-6 3-6-3 6-3ZM2 8l6 3 6-3M2 11l6 3 6-3" />
          : <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="m5 8 2 2 4-4" /></>}
      </svg>
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
    </span>
  );
}
