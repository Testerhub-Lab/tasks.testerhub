"use server";

import prisma from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth/session";
import { setCurrentWorkspaceId } from "../auth/workspace";
import { buildWorkspaceInviteLink } from "../auth/invite";
import { ProjectRole } from "@prisma/client";
import { getWorkspaceRole, hasProjectRole } from "../auth/access";

async function canManageWorkspace(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  workspaceId: string
) {
  return (await getWorkspaceRole(user, workspaceId)) === "ADMIN";
}

async function canManageProject(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  workspaceId: string,
  projectId: string
) {
  return Boolean(
    await hasProjectRole(user, projectId, ProjectRole.ADMIN, {
      workspaceId,
      includeArchived: true,
    })
  );
}

export async function setWorkspaceAction(workspaceId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { workspaceId: true, role: true },
  });

  if (!membership) return { ok: false as const };
  if (membership.role !== "ADMIN" && user.role !== "ADMIN") {
    const activeProjectAccess = await prisma.projectMember.findFirst({
      where: {
        userId: user.id,
        project: { workspaceId },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (!activeProjectAccess) return { ok: false as const };
  }

  await setCurrentWorkspaceId(workspaceId);
  return { ok: true as const };
}

const updateWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(2).max(80),
});

export async function updateWorkspaceAction(input: {
  workspaceId: string;
  name: string;
}) {
  try {
    const validated = updateWorkspaceSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    if (!(await canManageWorkspace(user, validated.workspaceId))) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    await prisma.workspace.update({
      where: { id: validated.workspaceId },
      data: { name: validated.name.trim() },
      select: { id: true },
    });

    revalidatePath("/");
    revalidatePath("/board");
    revalidatePath("/issues");
    revalidatePath("/backlog");
    revalidatePath("/settings/workspace");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось обновить воркспейс" };
  }
}

const inviteLinkSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  projectRole: z.enum(["MEMBER", "VIEWER"]).default("MEMBER"),
  accessDurationDays: z.number().int().min(1).max(365).optional().nullable(),
});

export async function createWorkspaceInviteAction(input: {
  workspaceId: string;
  projectId: string;
  projectRole?: "MEMBER" | "VIEWER";
  accessDurationDays?: number | null;
}) {
  try {
    const validated = inviteLinkSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    if (
      !(await canManageProject(
        user,
        validated.workspaceId,
        validated.projectId
      ))
    ) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: validated.workspaceId },
      select: { id: true, slug: true },
    });

    if (!workspace) {
      return { ok: false as const, formError: "Workspace not found" };
    }

    const projectId = validated.projectId;
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspaceId: validated.workspaceId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!project) {
      return { ok: false as const, formError: "Project not found" };
    }

    const baseUrl = process.env.MAIN_APP_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) {
      return { ok: false as const, formError: "MAIN_APP_BASE_URL is not set" };
    }

    const now = Date.now();
    const exp = new Date(now + 1000 * 60 * 60 * 24 * 7);
    const created = await prisma.workspaceInvite.create({
      data: {
        workspaceId: validated.workspaceId,
        projectId,
        projectRole: validated.projectRole,
        accessDurationDays: validated.accessDurationDays,
        createdById: user.id,
        expiresAt: exp,
      },
      select: { id: true, expiresAt: true },
    });
    revalidatePath("/settings/workspace");
    const link = buildWorkspaceInviteLink({
      baseUrl,
      wsSlug: workspace.slug,
      projectId,
      exp: created.expiresAt.getTime(),
      inviteId: created.id,
    });

    if (!link) {
      return { ok: false as const, formError: "WORKSPACE_INVITE_SECRET is not set" };
    }

    return { ok: true as const, link, inviteId: created.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось создать ссылку" };
  }
}

const revokeInviteSchema = z.object({
  workspaceId: z.string().min(1),
  inviteId: z.string().min(1),
});

export async function revokeWorkspaceInviteAction(input: {
  workspaceId: string;
  inviteId: string;
}) {
  try {
    const validated = revokeInviteSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    const invite = await prisma.workspaceInvite.findFirst({
      where: {
        id: validated.inviteId,
        workspaceId: validated.workspaceId,
      },
      select: { id: true, projectId: true },
    });
    if (!invite) {
      return { ok: false as const, formError: "Ссылка не найдена" };
    }

    const allowed = invite.projectId
      ? await canManageProject(
          user,
          validated.workspaceId,
          invite.projectId
        )
      : await canManageWorkspace(user, validated.workspaceId);
    if (!allowed) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
      select: { id: true },
    });

    revalidatePath("/settings/workspace");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось отозвать ссылку" };
  }
}

const createProjectSchema = z.object({
  workspaceId: z.string().min(1),
  key: z
    .string()
    .min(2)
    .max(6)
    .regex(/^[A-Z0-9]+$/, "Project key must be A-Z/0-9"),
  name: z.string().min(2).max(60),
});

export async function createWorkspaceProjectAction(input: {
  workspaceId: string;
  key: string;
  name: string;
}) {
  try {
    const validated = createProjectSchema.parse({
      ...input,
      key: input.key.trim().toUpperCase(),
      name: input.name.trim(),
    });
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    if (!(await canManageWorkspace(user, validated.workspaceId))) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const existing = await prisma.project.findUnique({
      where: { key: validated.key },
      select: { id: true },
    });
    if (existing) {
      return { ok: false as const, formError: "Ключ проекта уже используется" };
    }

    await prisma.project.create({
      data: {
        key: validated.key,
        name: validated.name,
        workspaceId: validated.workspaceId,
      },
      select: { id: true },
    });

    revalidatePath("/settings/workspace");
    revalidatePath("/board");
    revalidatePath("/issues");
    revalidatePath("/backlog");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось создать проект" };
  }
}

const archiveProjectSchema = z.object({
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  archived: z.boolean(),
});

export async function setProjectArchivedAction(input: {
  workspaceId: string;
  projectId: string;
  archived: boolean;
}) {
  try {
    const validated = archiveProjectSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    if (
      !(await canManageProject(
        user,
        validated.workspaceId,
        validated.projectId
      ))
    ) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const project = await prisma.project.findFirst({
      where: { id: validated.projectId, workspaceId: validated.workspaceId },
      select: { id: true },
    });
    if (!project) {
      return { ok: false as const, formError: "Project not found" };
    }

    await prisma.project.update({
      where: { id: validated.projectId },
      data: { archivedAt: validated.archived ? new Date() : null },
      select: { id: true },
    });

    revalidatePath("/settings/workspace");
    revalidatePath("/board");
    revalidatePath("/issues");
    revalidatePath("/backlog");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось обновить проект" };
  }
}

const updateMemberRoleSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function updateWorkspaceMemberRoleAction(input: {
  workspaceId: string;
  memberId: string;
  role: "ADMIN" | "MEMBER";
}) {
  try {
    const validated = updateMemberRoleSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    if (!(await canManageWorkspace(user, validated.workspaceId))) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const target = await prisma.workspaceMember.findUnique({
      where: { id: validated.memberId },
      select: { userId: true, role: true, workspaceId: true },
    });

    if (!target || target.workspaceId !== validated.workspaceId) {
      return { ok: false as const, formError: "Участник не найден" };
    }

    if (target.userId === user.id && validated.role !== "ADMIN") {
      return { ok: false as const, formError: "Нельзя понизить себя" };
    }

    await prisma.workspaceMember.update({
      where: { id: validated.memberId },
      data: { role: validated.role },
      select: { id: true },
    });

    revalidatePath("/settings/workspace");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось обновить роль" };
  }
}

const removeMemberSchema = z.object({
  workspaceId: z.string().min(1),
  memberId: z.string().min(1),
});

export async function removeWorkspaceMemberAction(input: {
  workspaceId: string;
  memberId: string;
}) {
  try {
    const validated = removeMemberSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    if (!(await canManageWorkspace(user, validated.workspaceId))) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const target = await prisma.workspaceMember.findUnique({
      where: { id: validated.memberId },
      select: { userId: true, workspaceId: true },
    });
    if (!target || target.workspaceId !== validated.workspaceId) {
      return { ok: false as const, formError: "Участник не найден" };
    }

    if (target.userId === user.id) {
      return { ok: false as const, formError: "Нельзя удалить себя" };
    }

    const projectIds = await prisma.project.findMany({
      where: { workspaceId: validated.workspaceId },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.projectMember.deleteMany({
        where: {
          userId: target.userId,
          projectId: { in: projectIds.map((project) => project.id) },
        },
      }),
      prisma.workspaceMember.delete({
        where: { id: validated.memberId },
      }),
    ]);

    revalidatePath("/settings/workspace");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось удалить участника" };
  }
}

const updateProjectMemberRoleSchema = z.object({
  workspaceId: z.string().min(1),
  projectMemberId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export async function updateProjectMemberRoleAction(input: {
  workspaceId: string;
  projectMemberId: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
}) {
  try {
    const validated = updateProjectMemberRoleSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    const target = await prisma.projectMember.findUnique({
      where: { id: validated.projectMemberId },
      select: {
        id: true,
        userId: true,
        projectId: true,
        project: { select: { workspaceId: true } },
      },
    });
    if (!target || target.project.workspaceId !== validated.workspaceId) {
      return { ok: false as const, formError: "Участник проекта не найден" };
    }
    if (
      !(await canManageProject(
        user,
        validated.workspaceId,
        target.projectId
      ))
    ) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }
    if (target.userId === user.id && validated.role !== "ADMIN") {
      return { ok: false as const, formError: "Нельзя понизить себя" };
    }

    await prisma.projectMember.update({
      where: { id: target.id },
      data: { role: validated.role },
      select: { id: true },
    });

    revalidatePath("/settings/workspace");
    revalidatePath("/board");
    revalidatePath("/issues");
    revalidatePath("/backlog");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось обновить роль" };
  }
}

const updateProjectMemberExpirySchema = z.object({
  workspaceId: z.string().min(1),
  projectMemberId: z.string().min(1),
  accessDurationDays: z.number().int().min(1).max(365).nullable(),
});

export async function updateProjectMemberExpiryAction(input: {
  workspaceId: string;
  projectMemberId: string;
  accessDurationDays: number | null;
}) {
  try {
    const validated = updateProjectMemberExpirySchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    const target = await prisma.projectMember.findUnique({
      where: { id: validated.projectMemberId },
      select: {
        id: true,
        userId: true,
        projectId: true,
        project: { select: { workspaceId: true } },
      },
    });
    if (!target || target.project.workspaceId !== validated.workspaceId) {
      return { ok: false as const, formError: "Участник проекта не найден" };
    }
    if (
      !(await canManageProject(
        user,
        validated.workspaceId,
        target.projectId
      ))
    ) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }
    if (target.userId === user.id) {
      return { ok: false as const, formError: "Нельзя ограничить собственный доступ" };
    }

    const expiresAt = validated.accessDurationDays
      ? new Date(
          Date.now() +
            validated.accessDurationDays * 24 * 60 * 60 * 1000
        )
      : null;

    await prisma.projectMember.update({
      where: { id: target.id },
      data: { expiresAt },
      select: { id: true },
    });

    revalidatePath("/settings/workspace");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось обновить срок доступа" };
  }
}

const removeProjectMemberSchema = z.object({
  workspaceId: z.string().min(1),
  projectMemberId: z.string().min(1),
});

export async function removeProjectMemberAction(input: {
  workspaceId: string;
  projectMemberId: string;
}) {
  try {
    const validated = removeProjectMemberSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, formError: "Требуется авторизация" };

    const target = await prisma.projectMember.findUnique({
      where: { id: validated.projectMemberId },
      select: {
        id: true,
        userId: true,
        projectId: true,
        project: { select: { workspaceId: true } },
      },
    });
    if (!target || target.project.workspaceId !== validated.workspaceId) {
      return { ok: false as const, formError: "Участник проекта не найден" };
    }
    if (
      !(await canManageProject(
        user,
        validated.workspaceId,
        target.projectId
      ))
    ) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }
    if (target.userId === user.id) {
      return { ok: false as const, formError: "Нельзя удалить себя из проекта" };
    }

    await prisma.projectMember.delete({
      where: { id: target.id },
    });

    revalidatePath("/settings/workspace");
    revalidatePath("/board");
    revalidatePath("/issues");
    revalidatePath("/backlog");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, formError: "Неверные данные" };
    }
    return { ok: false as const, formError: "Не удалось удалить доступ" };
  }
}
