import type { ReleaseSuggestion } from "../../shared/releases";
import { TASK_PRIORITY_VALUES, type TaskPriority } from "../../shared/taskEnums";

export type ReleaseAnalysisIssue = ReleaseSuggestion["issues"][number] & {
  type: string;
  priority: TaskPriority;
  description: string | null;
  tags: string[];
  parent: { id: string; title: string; key: string; type: string } | null;
};

type Project = { name: string; key: string };
type TopicMatch = { label: string; inTitle: boolean; titleSupport: boolean };
type Topic = { length: number; matches: Map<string, TopicMatch> };
type Parent = NonNullable<ReleaseAnalysisIssue["parent"]>;

const minIssues = 2;
export const RELEASE_SUGGESTION_MAX_ISSUES = 20;

const normalize = (word: string) => word.normalize("NFKC").toLowerCase().replaceAll("ё", "е");
const words = (text: string) => text.match(/[\p{L}\p{N}]+/gu) ?? [];

function term(word: string) {
  const key = normalize(word);
  if (/^(stories|story|сторис|сториз|стори)$/.test(key)) return "сторис";
  if (key.length < 4) return key;
  const stem = /^[а-я]+$/.test(key)
    ? key.replace(/(иями|иям|иях|ией|ием|ами|ями|ого|его|ему|ому|ение|ения|ию|ия|ий|ии|ый|ой|ая|яя|ое|ее|ые|ие|ых|их|ом|ем|ах|ях|ам|ям|ов|ев|ей|а|я|ы|и|у|ю|е|о)$/u, "")
    : key.replace(/s$/, "");
  return stem.length >= 3 ? stem : key;
}

const generic = new Set(`fix add change update check improve issue task bug this that with from into only and
  feature design frontend backend regression refactor test ticket implementation support project code error need make
  qa api status result stage staging prod production deploy deployment telegram tg телеграм max макс whatsapp linkedin
  задача исправить поправить исправление добавить добавление сделать обновить обновление доработать критерий
  проверить проверка тест тестирование настроить настройка улучшить улучшение изменить изменение
  удалить убрать подготовить новая новый работа проблема ошибка баг важно нужно должен цель актуальный текущий
  результат ожидание ожидаемый фактический описание шаг должно чтобы если когда для после перед через везде
  среда релиз бэклог проект владелец критерии приёмка публичный сценарий подтверждение
  общий единый реестр wiki`.trim().split(/\s+/).map(term));

const background = /^(?:уже\s+(?:принято|есть|сделано)|вне\s+(?:об[ъь][её]ма|scope|задачи)|за\s+рамками|без\s+дублей|связанные|wiki)(?=$|[\s:—.,*])/iu;
const issueReferences = /https?:\/\/\S+|\b[A-Z][A-Z0-9]+-\d+\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
const fragments = /[.!?;:,\n/]+|\s+(?:и|или|and|or)\s+/iu;

function projectAliases(project: Project) {
  const parts = words(project.name.replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2")).map(normalize);
  return [parts, [parts.join("")], [normalize(project.key)]].filter((alias) => alias[0]);
}

function collectTopics(
  text: string, aliases: string[][], inTitle: boolean, topics: Map<string, Topic>, issueId: string,
  titleTerms: Set<string>,
) {
  const cleanText = text.replace(issueReferences, " ");
  for (const fragment of cleanText.split(fragments)) {
    const tokens = words(fragment);
    const normalized = tokens.map(normalize);
    const anchors: { label: string; key: string; index: number }[] = [];
    for (let index = 0; index < tokens.length; index++) {
      const alias = aliases.find((parts) => parts.every((part, offset) => normalized[index + offset] === part));
      if (alias) {
        index += alias.length - 1;
        continue;
      }
      const label = tokens[index];
      const key = term(label);
      const short = label.length < 3 && !/^(?:QR|UI|UX)$/i.test(label);
      if (short || !/^\p{L}/u.test(label) || generic.has(key)) continue;
      anchors.push({ label, key, index });
      if (inTitle) titleTerms.add(key);
    }
    for (let index = 0; index < anchors.length - 1; index++) {
      const first = anchors[index];
      for (const length of [2, 3]) {
        const span = anchors.slice(index, index + length);
        if (span.length !== length || span[length - 1].index - first.index > length) continue;
        const keys = span.map(({ key }) => key);
        if (new Set(keys).size !== length) continue;
        const titleSupport = keys.some((key) => titleTerms.has(key));
        if (length === 2 && !titleSupport) continue;
        // A short phrase can appear in either order when the titles also support it.
        const signature = (length === 2 ? keys.sort() : keys).join(" ");
        let topic = topics.get(signature);
        if (!topic) {
          topic = { length, matches: new Map() };
          topics.set(signature, topic);
        }
        if (!topic.matches.has(issueId)) {
          topic.matches.set(issueId, { label: span.map(({ label }) => label).join(" "), inTitle, titleSupport });
        }
      }
    }
  }
}

export function suggestReleases(issues: ReleaseAnalysisIssue[], project: Project): ReleaseSuggestion[] {
  const parents = new Map<string, { parent: Parent; ids: Set<string> }>();
  const topics = new Map<string, Topic>();
  const indexedIssues = new Map(issues.map((issue) => [issue.id, issue]));
  const aliases = projectAliases(project);
  const ignoredTags = new Set(aliases.map((parts) => parts.join("")));
  function sharedTag(items: ReleaseAnalysisIssue[]) {
    return items[0].tags.find((tag) => {
      const key = normalize(tag.trim());
      return key && !generic.has(term(key)) && !ignoredTags.has(words(key).join("")) &&
        items.every((issue) => issue.tags.some((other) => normalize(other.trim()) === key));
    });
  }

  for (const issue of issues) {
    if (issue.parent) {
      const parent = issue.parent;
      let group = parents.get(parent.id);
      if (!group) {
        group = { parent, ids: new Set() };
        parents.set(parent.id, group);
      }
      group.ids.add(issue.id);
      if (indexedIssues.has(parent.id)) group.ids.add(parent.id);
    }
    const titleTerms = new Set<string>();
    collectTopics(issue.title, aliases, true, topics, issue.id, titleTerms);
    const description = (issue.description ?? "").replace(/`{3}[\s\S]*?(?:`{3}|$)/g, "");
    for (const paragraph of description.split(/\n\s*\n/)) {
      const plain = paragraph.replace(/^[\s#>*-]+/, "");
      if (!background.test(plain)) collectTopics(plain, aliases, false, topics, issue.id, titleTerms);
    }
  }

  const ranked = [...topics.values()].flatMap((topic) => {
    if (topic.matches.size < minIssues) return [];
    const matches = [...topic.matches.values()];
    const titleCount = matches.filter(({ inTitle }) => inTitle).length;
    if (!titleCount && topic.length < 3) return [];
    const titleSupport = matches.filter((match) => match.titleSupport).length;
    const items = [...topic.matches.keys()].map((id) => indexedIssues.get(id)!);
    const score = Math.min(titleCount, 2) * 6 + Math.min(titleSupport, 3) * 2 +
      topic.length * 2 + Math.min(matches.length, 5) + (sharedTag(items) ? 1 : 0);
    return [{ ...topic, score }];
  }).sort((a, b) => b.score - a.score);
  const structural = [...parents.values()].sort((a, b) =>
    Number(b.parent.type.toUpperCase() === "EPIC") - Number(a.parent.type.toUpperCase() === "EPIC") ||
    b.ids.size - a.ids.size
  );
  const used = new Set<string>();
  const suggestions: ReleaseSuggestion[] = [];
  function add(title: string, reason: string, available: ReleaseAnalysisIssue[]) {
    const members = available.sort((a, b) =>
      TASK_PRIORITY_VALUES.indexOf(b.priority) - TASK_PRIORITY_VALUES.indexOf(a.priority)
    ).slice(0, RELEASE_SUGGESTION_MAX_ISSUES);
    for (const issue of members) used.add(issue.id);
    suggestions.push({
      title: title.slice(0, 100).trim(),
      reason: reason.slice(0, 400),
      issues: members.map(({ id, title, key }) => ({ id, title, key })),
    });
  }

  for (const { parent, ids } of structural) {
    const available = [...ids].filter((id) => !used.has(id)).map((id) => indexedIssues.get(id)!);
    if (available.length < minIssues) continue;
    const reference = `${parent.key} «${parent.title}»`;
    const reason = parent.type.toUpperCase() === "EPIC"
      ? `Задачи входят в общий эпик ${reference}.`
      : `У задач общий родитель ${reference}.`;
    add(parent.title, reason, available);
    if (suggestions.length === 4) return suggestions;
  }
  for (const topic of ranked) {
    const available = [...topic.matches].filter(([id]) => !used.has(id));
    const titleMatch = available.find(([, match]) => match.inTitle);
    if (available.length < minIssues || (!titleMatch && topic.length < 3)) continue;
    const label = (titleMatch ?? available[0])[1].label;
    const items = available.map(([id]) => indexedIssues.get(id)!);
    const commonTag = sharedTag(items);
    const evidence = !titleMatch ? "описаниях"
      : available.every(([, match]) => match.inTitle) ? "заголовках" : "заголовках и описаниях";
    const reason = `В ${evidence} задач совпадает тема «${label}».`;
    const title = label[0].toUpperCase() + label.slice(1);
    add(title, commonTag ? `${reason} Общий лейбл — «${commonTag}».` : reason, items);
    if (suggestions.length === 4) return suggestions;
  }
  return suggestions;
}
