import type { ReleaseSuggestion } from "../../shared/releases";
import { TASK_PRIORITY_VALUES, type TaskPriority } from "../../shared/taskEnums";

export type ReleaseAnalysisIssue = ReleaseSuggestion["issues"][number] & {
  type: string;
  priority: TaskPriority;
  description: string | null;
  tags: string[];
  parent: { id: string; title: string; key: string; type: string } | null;
};

type Signal = "epic" | "parent" | "tag" | "phrase" | "word";
type Group = {
  signal: Signal;
  label: string;
  reference?: string;
  issues: Map<string, ReleaseAnalysisIssue>;
  titleHits: number;
};

const minIssues = 2;
export const RELEASE_SUGGESTION_MAX_ISSUES = 20;
const strength: Record<Signal, number> = { epic: 65, parent: 55, tag: 45, phrase: 30, word: 14 };
const generic = new Set(`fix fixes add change update check improve issue issues task tasks bug bugs this that with from ui ux
  feature design frontend backend regression refactor test tests testing ticket implementation support project code error need make only
  задача задачи задач исправить поправить исправление добавить добавление сделать обновить обновление доработать
  проверить проверка проверки тест тесты тестирование настроить настройка улучшить улучшение изменить изменение
  удалить убрать подготовить перенос новая новый новые работа работ проблема ошибки ошибка баг бага баги
  результат ожидание ожидаемый фактический описание шаги должно чтобы если когда для после перед через везде`.split(/\s+/));

function words(text: string, limit: number) {
  const content = text.replace(/https?:\/\/\S+|\b[A-Z][A-Z0-9]+-\d+\b/gi, " ");
  return (content.match(/[\p{L}][\p{L}\p{N}]*/gu) ?? [])
    .map((label) => ({ label, key: label.toLowerCase().replaceAll("ё", "е") }))
    .filter(({ label, key }) => !generic.has(key) && (key.length >= 4 || /^[A-Z]{2,3}$/.test(label)))
    .slice(0, limit)
    .map(({ label, key }) => {
      const stem = /^[а-я]+$/.test(key)
        ? key.replace(/(иями|ами|ями|ого|ему|ому|ение|ения|ий|ый|ая|ое|ые|ом|ах|ях|ам|ям|ов|ев|а|я|ы|и|у|ю|е|о)$/u, "")
        : key.replace(/s$/, "");
      return { label, key: stem.length >= 4 ? stem : key };
    });
}

function explain(group: Group) {
  const label = group.label;
  switch (group.signal) {
    case "epic":
      return `Задачи относятся к эпику ${group.reference} «${label}». Их можно выпустить вместе как часть одной цели.`;
    case "parent":
      return `У задач общий родитель ${group.reference} «${label}», поэтому их удобно проверить и выпустить вместе.`;
    case "tag":
      return `У задач общий лейбл «${label}». Проверьте их вместе как изменения в одной области.`;
    default:
      return `В задачах повторяется тема «${label}». Их можно проверить в одном релизе.`;
  }
}

export function suggestReleases(issues: ReleaseAnalysisIssue[]): ReleaseSuggestion[] {
  const groups = new Map<string, Group>();
  const indexedIssues = new Map(issues.map((issue) => [issue.id, issue]));
  function add(signal: Signal, key: string, label: string, issue: ReleaseAnalysisIssue, inTitle = false, reference?: string) {
    const groupKey = `${signal}:${key}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { signal, label, reference, issues: new Map(), titleHits: 0 };
      groups.set(groupKey, group);
    }
    if (group.issues.has(issue.id)) return;
    group.issues.set(issue.id, issue);
    if (inTitle) {
      group.label = label;
      group.titleHits++;
    }
  }

  for (const issue of issues) {
    if (issue.parent) {
      const parent = issue.parent;
      const signal = parent.type.toUpperCase() === "EPIC" ? "epic" : "parent";
      add(signal, parent.id, parent.title, issue, false, parent.key);
      const openParent = indexedIssues.get(parent.id);
      if (openParent) add(signal, parent.id, parent.title, openParent, false, parent.key);
    }
    for (const tag of issue.tags) {
      const key = tag.trim().toLowerCase();
      if (key && !generic.has(key)) add("tag", key, tag.trim(), issue);
    }
    const title = words(issue.title, 24);
    const description = words(issue.description ?? "", 28);
    for (const [index, word] of title.entries()) {
      add("word", word.key, word.label, issue, true);
      const next = title[index + 1];
      if (next && next.key !== word.key) {
        add("phrase", `${word.key} ${next.key}`, `${word.label} ${next.label}`, issue, true);
      }
    }
    for (const word of description) add("word", word.key, word.label, issue);
  }

  const ranked = [...groups.values()].filter((group) =>
    group.issues.size >= minIssues &&
    (group.signal !== "word" || group.titleHits >= minIssues && group.issues.size <= Math.max(10, issues.length * 0.65))
  ).sort((a, b) =>
    strength[b.signal] + Math.min(b.issues.size, RELEASE_SUGGESTION_MAX_ISSUES) -
    strength[a.signal] - Math.min(a.issues.size, RELEASE_SUGGESTION_MAX_ISSUES)
  );
  const used = new Set<string>();
  const suggestions: ReleaseSuggestion[] = [];
  for (const group of ranked) {
    const remaining = [...group.issues.values()].filter((issue) => !used.has(issue.id));
    if (remaining.length < minIssues) continue;
    const members = remaining.sort((a, b) =>
      TASK_PRIORITY_VALUES.indexOf(b.priority) - TASK_PRIORITY_VALUES.indexOf(a.priority)
    ).slice(0, RELEASE_SUGGESTION_MAX_ISSUES);
    for (const issue of members) used.add(issue.id);
    suggestions.push({
      title: group.label.slice(0, 100).trim(),
      reason: explain(group).slice(0, 400),
      issues: members.map(({ id, title, key }) => ({ id, title, key })),
    });
    if (suggestions.length === 4) break;
  }
  return suggestions;
}
