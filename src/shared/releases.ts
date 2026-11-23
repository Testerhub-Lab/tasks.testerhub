export const releaseStatusLabels = {
  draft: "Черновик",
  planned: "Запланирован",
  released: "Выпущен",
} as const;

export type ReleaseStatus = keyof typeof releaseStatusLabels;

export type Release = {
  id: string;
  title: string;
  goal: string;
  plannedDate: string | null;
  status: ReleaseStatus;
};

export type ReleaseOption = Pick<Release, "id" | "title" | "status">;

export type ReleaseIssue = {
  id: string;
  key: string;
  title: string;
  archived: boolean;
  type: string;
  status: TaskStatus;
};

export type ReleaseSuggestion = {
  title: string;
  reason: string;
  issues: Pick<ReleaseIssue, "id" | "key" | "title">[];
};

export function formatReleaseDate(date: string | null) {
  return date
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(`${date}T00:00:00Z`)
      )
    : "Дата не задана";
}
import type { TaskStatus } from "./taskEnums";
