import { ProjectRole, Role, type WorkspaceRole } from "@prisma/client";
import prisma from "@/lib/prisma";
export { projectRoleAtLeast } from "./accessPolicy";
import { projectRoleAtLeast } from "./accessPolicy";

export type AccessUser = {
  id: string;
  role: Role;
};

export type ProjectAccess = {
  projectId: string;
  workspaceId: string;
  role: ProjectRole;
  isWorkspaceAdmin: boolean;
};

const activeMembershipWhere = (userId: string, now = new Date()) => ({
  userId,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

export async function getWorkspaceRole(
  user: AccessUser,
  workspaceId: string
): Promise<WorkspaceRole | null> {
  if (user.role === Role.ADMIN) return "ADMIN";

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
    select: { role: true },
  });

  return membership?.role ?? null;
}

export async function getAccessibleProjectIds(
  user: AccessUser,
  workspaceId: string,
  options?: { includeArchived?: boolean }
): Promise<string[]> {
  const workspaceRole = await getWorkspaceRole(user, workspaceId);
  if (!workspaceRole) return [];

  const projects = await prisma.project.findMany({
    where: {
      workspaceId,
      ...(options?.includeArchived ? {} : { archivedAt: null }),
      ...(workspaceRole === "ADMIN"
        ? {}
        : {
            members: {
              some: activeMembershipWhere(user.id),
            },
          }),
    },
    select: { id: true },
  });

  return projects.map((project) => project.id);
}

export async function getProjectAccess(
  user: AccessUser,
  projectId: string,
  options?: {
    workspaceId?: string;
    includeArchived?: boolean;
  }
): Promise<ProjectAccess | null> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options?.includeArchived ? {} : { archivedAt: null }),
    },
    select: { id: true, workspaceId: true },
  });

  if (!project) return null;

  const workspaceRole = await getWorkspaceRole(user, project.workspaceId);
  if (!workspaceRole) return null;

  if (workspaceRole === "ADMIN") {
    return {
      projectId: project.id,
      workspaceId: project.workspaceId,
      role: ProjectRole.ADMIN,
      isWorkspaceAdmin: true,
    };
  }

  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId: project.id,
      ...activeMembershipWhere(user.id),
    },
    select: { role: true },
  });

  if (!membership) return null;

  return {
    projectId: project.id,
    workspaceId: project.workspaceId,
    role: membership.role,
    isWorkspaceAdmin: false,
  };
}

export async function hasProjectRole(
  user: AccessUser,
  projectId: string,
  requiredRole: ProjectRole,
  options?: {
    workspaceId?: string;
    includeArchived?: boolean;
  }
): Promise<ProjectAccess | null> {
  const access = await getProjectAccess(user, projectId, options);
  if (!access || !projectRoleAtLeast(access.role, requiredRole)) return null;
  return access;
}

export async function canAssignUserToProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      workspaceMemberships: {
        where: { workspace: { projects: { some: { id: projectId } } } },
        select: { role: true },
      },
      projectMemberships: {
        where: {
          projectId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      },
    },
  });

  if (!user) return false;
  if (user.role === Role.ADMIN) return true;
  if (user.workspaceMemberships.some((membership) => membership.role === "ADMIN")) {
    return true;
  }

  return user.workspaceMemberships.length > 0 && user.projectMemberships.length > 0;
}
