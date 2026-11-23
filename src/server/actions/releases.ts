"use server";

import { ProjectRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasProjectRole } from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getProjectById } from "@/server/queries/projects";
import { changeReleaseIssues, createSuggestedReleaseDraft, getAvailableReleaseIssues, getReleaseAnalysisIssues, saveProjectRelease, setIssueRelease } from "@/server/queries/releases";
import { RELEASE_SUGGESTION_MAX_ISSUES, suggestReleases } from "@/server/releases/suggestReleases";
import { buildProjectIssueViewPath, buildProjectReleasesPath } from "@/shared/projectKeyRoutes";
import {
  DEFAULT_RELEASE_ISSUE_STATUS_FILTER, RELEASE_ISSUE_STATUS_FILTERS, type ReleaseIssueStatusFilter,
} from "@/shared/releases";

const projectIdSchema = z.string().trim().min(1).max(128);
const releaseSchema = z.object({
  projectId: projectIdSchema,
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(100),
  goal: z.string().trim().max(400),
  plannedDate: z.iso.date().refine((date) => date >= "0001-01-01").nullable(),
  status: z.enum(["draft", "planned", "released"]).optional(),
});
const issuesSchema = z.object({
  projectId: projectIdSchema,
  releaseId: z.uuid(),
  issueIds: z.array(z.string().min(1).max(128)).nonempty(),
  operation: z.enum(["add", "remove"]),
});
const issueReleaseSchema = z.object({
  projectId: projectIdSchema,
  issueId: z.string().min(1).max(128),
  previousReleaseId: z.uuid().nullable(),
  releaseId: z.uuid().nullable(),
});

const fail = (formError: string) => ({ ok: false as const, formError });

async function writableProject(projectId: string) {
  const user = await getCurrentUser();
  const workspaceId = await getCurrentWorkspaceId();
  if (!user || !workspaceId) return fail("Требуется авторизация");
  if (!await hasProjectRole(user, projectId, ProjectRole.MEMBER, { workspaceId })) {
    return fail("У вас нет прав редактировать релизы этого проекта.");
  }
  const project = await getProjectById(projectId, workspaceId, user);
  if (!project) return fail("Проект недоступен.");
  return { ok: true as const, project };
}

function refreshRelease(projectKey: string, ...releaseIds: (string | null)[]) {
  revalidatePath(buildProjectReleasesPath(projectKey));
  for (const id of new Set(releaseIds)) {
    if (id) revalidatePath(buildProjectReleasesPath(projectKey, id));
  }
  revalidatePath(buildProjectIssueViewPath(projectKey, "/backlog"));
  revalidatePath("/backlog");
}

export async function saveReleaseAction(input: z.input<typeof releaseSchema>) {
  const parsed = releaseSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте название, цель и плановую дату.");

  try {
    const { projectId, ...data } = parsed.data;
    const access = await writableProject(projectId);
    if (!access.ok) return access;
    const release = await saveProjectRelease(projectId, data);
    if (!release) return fail("Релиз недоступен.");
    refreshRelease(access.project.key, release.id);
    return { ok: true as const, href: buildProjectReleasesPath(access.project.key, release.id) };
  } catch (error) {
    console.error("Failed to save release", error);
    return fail("Не удалось сохранить релиз.");
  }
}

export async function changeReleaseIssuesAction(input: z.input<typeof issuesSchema>) {
  const parsed = issuesSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте выбранный релиз и задачи.");

  try {
    const { projectId, releaseId, issueIds, operation } = parsed.data;
    const access = await writableProject(projectId);
    if (!access.ok) return access;
    const result = await changeReleaseIssues(projectId, releaseId, issueIds, operation);
    if (result === "closed") return fail("Релиз недоступен или уже выпущен.");
    if (result === "unavailable") return fail("Часть выбранных задач недоступна в этом проекте.");
    if (result === "assigned") return fail("Часть задач уже входит в другой релиз.");
    refreshRelease(access.project.key, releaseId);
    return { ok: true as const };
  } catch (error) {
    console.error("Failed to change release issues", error);
    return fail("Не удалось изменить состав релиза.");
  }
}

export async function searchReleaseIssuesAction(
  projectId: string, search: string, status: ReleaseIssueStatusFilter = DEFAULT_RELEASE_ISSUE_STATUS_FILTER, page = 0
) {
  const parsed = z.object({
    projectId: projectIdSchema,
    search: z.string().trim().max(120),
    status: z.enum(RELEASE_ISSUE_STATUS_FILTERS),
    page: z.number().int().min(0).max(20000),
  }).safeParse({ projectId, search, status, page });
  if (!parsed.success) return fail("Некорректный поиск.");
  try {
    const access = await writableProject(parsed.data.projectId);
    if (!access.ok) return access;
    const { search, status, page } = parsed.data;
    const results = await getAvailableReleaseIssues(parsed.data.projectId, search, status, page);
    return { ok: true as const, ...results };
  } catch (error) {
    console.error("Failed to search issues for release", error);
    return fail("Не удалось найти задачи.");
  }
}

export async function proposeReleasesAction(projectId: string) {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return fail("Выберите проект.");
  try {
    const access = await writableProject(parsed.data);
    if (!access.ok) return access;
    const issues = await getReleaseAnalysisIssues(access.project.id);
    return { ok: true as const, count: issues.length, suggestions: suggestReleases(issues, access.project) };
  } catch (error) {
    console.error("Failed to suggest releases", error);
    return fail("Не удалось проанализировать бэклог.");
  }
}

const suggestedDraftSchema = releaseSchema.pick({ projectId: true, title: true, goal: true }).extend({
  issueIds: z.array(z.string().min(1).max(128)).min(2).max(RELEASE_SUGGESTION_MAX_ISSUES)
    .refine((ids) => new Set(ids).size === ids.length),
});

export async function saveSuggestedReleaseAction(input: z.input<typeof suggestedDraftSchema>) {
  const parsed = suggestedDraftSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте состав черновика.");
  try {
    const { projectId, title, goal, issueIds } = parsed.data;
    const access = await writableProject(projectId);
    if (!access.ok) return access;
    const result = await createSuggestedReleaseDraft(projectId, title, goal, issueIds);
    if (!result.ok) return fail("Бэклог изменился. Обновите предложения и выберите набор заново.");
    refreshRelease(access.project.key, result.releaseId);
    return { ok: true as const, href: buildProjectReleasesPath(access.project.key, result.releaseId) };
  } catch (error) {
    console.error("Failed to save suggested release", error);
    return fail("Не удалось сохранить черновик.");
  }
}

export async function setIssueReleaseAction(input: z.input<typeof issueReleaseSchema>) {
  const parsed = issueReleaseSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте выбранный релиз.");

  try {
    const { projectId, issueId, previousReleaseId, releaseId } = parsed.data;
    const access = await writableProject(projectId);
    if (!access.ok) return access;
    const result = await setIssueRelease(projectId, issueId, previousReleaseId, releaseId);
    if (result === "closed") return fail("Релиз недоступен или уже выпущен.");
    if (result === "unavailable") return fail("Задача недоступна.");
    if (result === "stale") return fail("Привязка к релизу уже изменилась. Проверьте актуальный выбор.");
    refreshRelease(access.project.key, previousReleaseId, releaseId);
    return { ok: true as const };
  } catch (error) {
    console.error("Failed to assign issue to release", error);
    return fail("Не удалось изменить релиз задачи.");
  }
}
