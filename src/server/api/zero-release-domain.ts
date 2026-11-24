import {
  changeReleaseIssues,
  getProjectReleases,
} from "@/server/queries/releases";
import { getZeroDatabase, type ZeroTransaction } from "@/zero/db";
import type { ApiActor } from "./auth";
import { ApiError } from "./errors";
import { requireApiProjectByKey } from "./zero-domain";

export async function requireApiReleaseProject(
  user: ApiActor,
  projectKey: string,
  write = false
) {
  const { project, role } = await requireApiProjectByKey(user.id, projectKey);
  if (write && (!role || role === "VIEWER")) {
    throw new ApiError(403, "forbidden", "Недостаточно прав для изменения релизов");
  }
  return project;
}

export async function listApiReleases(user: ApiActor, projectKey: string) {
  const project = await requireApiReleaseProject(user, projectKey);
  return getZeroDatabase().transaction((tx) => getProjectReleases(project.id, tx));
}

export async function addApiReleaseIssues(
  project: { id: string; key: string },
  releaseId: string,
  issueKeys: string[],
  tx: ZeroTransaction
) {
  const keys = [...new Set(issueKeys)];
  const prefix = `${project.key}-`;
  const numbers = keys.map((key) => key.startsWith(prefix) ? Number(key.slice(prefix.length)) : NaN);
  const unavailable = () => new ApiError(
    404, "issue_not_found", "Часть выбранных задач недоступна в этом проекте"
  );
  if (numbers.some((number) => !Number.isInteger(number) || number > 2147483647)) {
    throw unavailable();
  }

  const { rows } = await tx.dbTransaction.wrappedTransaction.query<{ id: string }>(
    `SELECT id FROM issues
     WHERE project_id = $1 AND number = ANY($2::integer[]) AND archived_at IS NULL`,
    [project.id, numbers]
  );
  if (rows.length !== keys.length) throw unavailable();

  const result = await changeReleaseIssues(project.id, releaseId, rows.map(({ id }) => id), "add", tx);
  if (result === "unavailable") throw unavailable();
  if (result === "closed") {
    throw new ApiError(409, "release_closed", "Релиз недоступен или уже выпущен");
  }
  if (result === "assigned") {
    throw new ApiError(409, "issue_already_assigned", "Часть задач уже входит в другой релиз");
  }
  return { releaseId, issueKeys: keys };
}
