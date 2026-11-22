import { ProjectRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getProjectAccess, projectRoleAtLeast } from "@/server/auth/access";
import { resolveProjectRouteContext } from "../projectRoute";

export async function resolveReleaseProject(projectKey: string, releaseId?: string) {
  if (releaseId !== undefined && !z.uuid().safeParse(releaseId).success) notFound();
  const { id, key, user, workspaceId } = await resolveProjectRouteContext({
    projectKey,
    searchParams: {},
    viewPath: releaseId ? `/releases/${releaseId}` : "/releases",
  });
  const access = await getProjectAccess(user, id, { workspaceId });
  if (!access) notFound();
  return { id, key, canEdit: projectRoleAtLeast(access.role, ProjectRole.MEMBER) };
}
