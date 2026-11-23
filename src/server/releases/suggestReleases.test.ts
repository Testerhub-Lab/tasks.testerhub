import { describe, expect, it } from "vitest";
import { RELEASE_SUGGESTION_MAX_ISSUES, suggestReleases, type ReleaseAnalysisIssue } from "./suggestReleases";

function issue(number: number, title: string, extra: Partial<ReleaseAnalysisIssue> = {}): ReleaseAnalysisIssue {
  return {
    id: String(number), key: `TH-${number}`, title, type: "TASK",
    priority: "MEDIUM", description: null, parent: null, tags: [], ...extra,
  };
}

describe("release proposals", () => {
  it("finds structural and topic groups and assigns each task to only one proposal", () => {
    const epic = issue(1, "Согласование заявок", { type: "EPIC" });
    const proposals = suggestReleases([
      epic,
      issue(2, "Права менеджера", { parent: epic, tags: ["согласование"] }),
      issue(3, "Уведомления для автора", { parent: epic, tags: ["согласование"] }),
      issue(4, "Исправить экспорт CSV"),
      issue(5, "Настроить экспорт CSV"),
      issue(6, "Смена часового пояса"),
    ]);
    expect(proposals).toHaveLength(2);
    expect(proposals[0].reason).toContain("эпику TH-1");
    expect(proposals[0].issues.map(({ id }) => id).sort()).toEqual(["1", "2", "3"]);
    expect(proposals[1].reason).toContain("экспорт CSV");
    expect(proposals[1].issues.map(({ id }) => id)).toEqual(["4", "5"]);
    const ids = proposals.flatMap(({ issues }) => issues.map(({ id }) => id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not build a release from generic verbs, tags and unrelated issue keys", () => {
    expect(suggestReleases([
      issue(1, "Проверить форму TH-10", { tags: ["frontend"] }),
      issue(2, "Проверить оплату TH-20", { tags: ["frontend"] }),
    ])).toEqual([]);
  });

  it("uses descriptive text to extend an established topic", () => {
    const [proposal] = suggestReleases([
      issue(1, "Обновить экспорт отчётов"),
      issue(2, "Добавить экспорт выборки"),
      issue(3, "Неверные даты", { description: "Ошибки возникают при экспорте статистики" }),
    ]);
    expect(proposal.issues).toHaveLength(3);
  });

  it("selects higher priorities first when a set needs to be limited", () => {
    const issueCount = RELEASE_SUGGESTION_MAX_ISSUES + 3;
    const group = Array.from({ length: issueCount }, (_, index) =>
      issue(index + 1, `Рабочий элемент ${index + 1}`, {
        tags: ["календарь"],
        priority: index === issueCount - 1 ? "CRITICAL" : "LOW",
      })
    );
    const [proposal] = suggestReleases(group);
    expect(proposal.issues).toHaveLength(RELEASE_SUGGESTION_MAX_ISSUES);
    expect(proposal.issues[0].id).toBe(String(issueCount));
  });
});
