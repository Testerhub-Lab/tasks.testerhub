import { describe, expect, it } from "vitest";
import { RELEASE_SUGGESTION_MAX_ISSUES, suggestReleases, type ReleaseAnalysisIssue } from "./suggestReleases";

function issue(number: number, title: string, extra: Partial<ReleaseAnalysisIssue> = {}): ReleaseAnalysisIssue {
  return {
    id: String(number), key: `TH-${number}`, title, type: "TASK",
    priority: "MEDIUM", description: null, parent: null, tags: [], ...extra,
  };
}

const project = { key: "TH", name: "EasyPost" };

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
    ], project);
    expect(proposals).toHaveLength(2);
    expect(proposals[0].reason).toContain("эпик TH-1");
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
    ], project)).toEqual([]);
  });

  it("ignores the project identity even in a multi-word match and uses platforms and tags as context only", () => {
    expect(suggestReleases([
      issue(1, "Аналитика публикаций EasyPost", { tags: ["EasyPost"] }),
      issue(2, "Права публикаций Easy Post", { tags: ["EasyPost"] }),
      issue(3, "Публикация Telegram-сторис", { tags: ["stories", "telegram"] }),
      issue(4, "Командные роли Telegram", { tags: ["stories", "telegram"] }),
      issue(5, "Отзывать подключение Telegram и MAX", { tags: ["telegram"] }),
      issue(6, "Фоновые конвертации TH", { tags: ["TH"] }),
      issue(7, "Очередь TH", { tags: ["TH"] }),
    ], project)).toEqual([]);
  });

  it("uses a detail from descriptions to confirm a shared title topic", () => {
    const [proposal] = suggestReleases([
      issue(1, "Обновить экспорт отчётов"),
      issue(2, "Фильтры отчётов", { description: "При экспорте отчетов сохранять фильтр периода." }),
      issue(3, "Даты событий", { description: "Этот компонент также используется при экспорте отчетов." }),
      issue(4, "Экспорт выборки", { description: "Данные выгружаются в JSON." }),
    ], project);
    expect(proposal.title).toBe("Экспорт отчётов");
    expect(proposal.issues.map(({ id }) => id)).toEqual(["1", "2"]);
  });

  it("finds a specific scenario in descriptions with different titles and inflections", () => {
    const [proposal] = suggestReleases([
      issue(1, "Пропадают фильтры", { description: "После экспорта банковских отчётов пропадает фильтр периода." }),
      issue(2, "Неверный диапазон дат", { description: "Экспорт банковского отчета использует неверное время начала периода." }),
      issue(3, "Сверка баланса", { description: "Сверить категории платежей из банковских отчётов." }),
    ], project);
    expect(proposal.reason).toContain("В описаниях задач совпадает тема");
    expect(proposal.issues.map(({ id }) => id)).toEqual(["1", "2"]);
  });

  it("ignores retrospective and out-of-scope paragraphs and references", () => {
    expect(suggestReleases([
      issue(1, "Мобильная клавиатура", {
        description: "Уже принято: проверка публикации отложенных сторис TH-111.",
      }),
      issue(2, "Новые уведомления", {
        description: "Вне объёма: публикация отложенных сторис TH-111.",
      }),
      issue(3, "Публикация отложенных сторис", {
        description: "Wiki 12345678-dead-4ebe-aba2-123456789abc",
      }),
      issue(4, "Напоминание об оплате", {
        description: "Подробности: общий реестр 12345678-dead-4ebe-aba2-123456789abc",
      }),
    ], project)).toEqual([]);
  });

  it("does not pull a separate roadmap task into a focused stories group just because it shares a tag", () => {
    const [proposal] = suggestReleases([
      issue(1, "Публикация сторис через бота Telegram", { tags: ["stories"] }),
      issue(2, "График публикации Stories в канале MAX", { tags: ["stories"] }),
      issue(3, "Командные права на аккаунты", {
        tags: ["stories"],
        description: "Будущая веха: рабочие пространства и роли, доступ к аккаунтам публикации.",
      }),
    ], project);
    expect(proposal.issues.map(({ id }) => id)).toEqual(["1", "2"]);
    expect(proposal.reason).toContain("Общий лейбл — «stories»");
  });

  it("selects higher priorities first when a set needs to be limited", () => {
    const issueCount = RELEASE_SUGGESTION_MAX_ISSUES + 3;
    const group = Array.from({ length: issueCount }, (_, index) =>
      issue(index + 1, `Импорт календаря ${index + 1}`, {
        priority: index === issueCount - 1 ? "CRITICAL" : "LOW",
      })
    );
    const [proposal] = suggestReleases(group, project);
    expect(proposal.issues).toHaveLength(RELEASE_SUGGESTION_MAX_ISSUES);
    expect(proposal.issues[0].id).toBe(String(issueCount));
  });
});
