import prisma from "../../lib/prisma";
import type { AccessUser } from "../auth/access";
import {
  getAccessibleProjectIds,
  getProjectAccess,
  getWorkspaceRole,
  projectRoleAtLeast,
} from "../auth/access";
import { ProjectRole } from "@prisma/client";
import {
  getZeroProjectByID,
  getZeroProjectByKey,
  getZeroProjects,
  usesZeroUiStore,
} from "@/server/ui/zero-legacy";
const DEFAULT_PROJECT = {
  key: "TH",
  name: "TesterHub",
};

export async function getOrCreateDefaultProject(workspaceId: string) {
  const existing = await prisma.project.findFirst({
    where: { key: DEFAULT_PROJECT.key, workspaceId },
  });
  if (existing) return existing;
  return prisma.project.create({
    data: { ...DEFAULT_PROJECT, workspaceId },
  });
}

export async function getProjects(
  workspaceId: string,
  user: AccessUser,
  options?: { includeArchived?: boolean }
) {
  if (usesZeroUiStore()) {
    return getZeroProjects(workspaceId, user.id, options);
  }
  const [accessibleProjectIds, workspaceRole] = await Promise.all([
    getAccessibleProjectIds(user, workspaceId, options),
    getWorkspaceRole(user, workspaceId),
  ]);
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      workspaceId,
      id: { in: accessibleProjectIds },
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    select: {
      id: true,
      name: true,
      key: true,
      archivedAt: true,
      members: {
        where: {
          userId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { role: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return projects.map(({ members, ...project }) => {
    const accessRole =
      workspaceRole === "ADMIN"
        ? ProjectRole.ADMIN
        : members[0]?.role ?? ProjectRole.VIEWER;
    return {
      ...project,
      accessRole,
      canWrite: projectRoleAtLeast(accessRole, ProjectRole.MEMBER),
    };
  });
}

export async function getProjectById(
  id: string,
  workspaceId: string,
  user: AccessUser,
  options?: { includeArchived?: boolean }
) {
  if (usesZeroUiStore()) {
    return getZeroProjectByID(id, workspaceId, user.id, options);
  }
  const access = await getProjectAccess(user, id, {
    workspaceId,
    includeArchived: options?.includeArchived,
  });
  if (!access) return null;

  return prisma.project.findFirst({
    where: {
      id,
      ...(workspaceId ? { workspaceId } : {}),
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    select: { id: true, name: true, key: true, archivedAt: true },
  });
}

export async function getProjectByKey(
  key: string,
  workspaceId: string,
  options?: { includeArchived?: boolean }
) {
  if (usesZeroUiStore()) {
    return getZeroProjectByKey(key, workspaceId, options);
  }
  return prisma.project.findFirst({
    where: {
      key: key.toUpperCase(),
      workspaceId,
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    select: { id: true, key: true, name: true, archivedAt: true },
  });
}
