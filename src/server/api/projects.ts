import { ProjectRole, Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  getProjectAccess,
  projectRoleAtLeast,
} from "@/server/auth/access";
import type { ApiActor } from "./auth";
import { ApiError } from "./errors";

export async function listAccessibleProjects(
  user: ApiActor,
  workspaceId?: string | null
) {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      archivedAt: null,
      ...(workspaceId ? { workspaceId } : {}),
      ...(user.role === Role.ADMIN
        ? {}
        : {
            workspace: {
              members: { some: { userId: user.id } },
            },
            OR: [
              {
                workspace: {
                  members: {
                    some: { userId: user.id, role: "ADMIN" },
                  },
                },
              },
              {
                members: {
                  some: {
                    userId: user.id,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      key: true,
      name: true,
      workspaceId: true,
      createdAt: true,
      workspace: {
        select: {
          name: true,
          slug: true,
          members: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      },
      members: {
        where: {
          userId: user.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { role: true, expiresAt: true },
      },
      knowledge: {
        select: { provider: true, externalUrl: true },
      },
    },
    orderBy: [{ workspaceId: "asc" }, { createdAt: "asc" }],
  });

  return projects.map((project) => {
    const workspaceRole = project.workspace.members[0]?.role;
    const role =
      user.role === Role.ADMIN || workspaceRole === "ADMIN"
        ? ProjectRole.ADMIN
        : project.members[0]?.role;
    if (!role) {
      throw new Error(`Accessible project ${project.key} has no resolved role`);
    }

    return {
      id: project.id,
      key: project.key,
      name: project.name,
      role,
      workspace: {
        id: project.workspaceId,
        name: project.workspace.name,
        slug: project.workspace.slug,
      },
      knowledge: project.knowledge ?? {
        provider: "DISABLED" as const,
        externalUrl: null,
      },
    };
  });
}

export async function requireApiProject(
  user: ApiActor,
  projectKey: string,
  requiredRole: ProjectRole
) {
  const project = await prisma.project.findFirst({
    where: {
      key: projectKey.trim().toUpperCase(),
      archivedAt: null,
    },
    select: {
      id: true,
      key: true,
      name: true,
      workspaceId: true,
      knowledge: {
        select: { provider: true, externalUrl: true },
      },
    },
  });
  if (!project) {
    throw new ApiError(404, "project_not_found", "Проект не найден");
  }

  const access = await getProjectAccess(user, project.id, {
    workspaceId: project.workspaceId,
  });
  if (!access) {
    throw new ApiError(404, "project_not_found", "Проект не найден");
  }
  if (!projectRoleAtLeast(access.role, requiredRole)) {
    throw new ApiError(
      403,
      "forbidden",
      "Недостаточно прав в проекте"
    );
  }

  return {
    ...project,
    role: access.role,
    knowledge: project.knowledge ?? {
      provider: "DISABLED" as const,
      externalUrl: null,
    },
  };
}
