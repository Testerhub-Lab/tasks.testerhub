// src/server/actions/tasks.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "../../lib/prisma";
import { sseManager } from "../../lib/sse";
import type { RealtimeEvent } from "../../types/realtime";
import { ActivityType, ProjectRole, Status } from "@prisma/client";
import { getCurrentUser } from "../auth/session";
import { getCurrentWorkspaceId } from "../auth/workspace";
import {
  canAssignUserToProject,
  getProjectAccess,
  hasProjectRole,
  projectRoleAtLeast,
} from "../auth/access";
import {
  taskSchema,
  taskStatusSchema,
  taskPrioritySchema,
  type TaskInput,
  type TaskPriority,
} from "../validators/task";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";
import {
  addZeroCommentForUI,
  archiveZeroTaskForUI,
  createZeroTaskForUI,
  getZeroTaskDeletionPermission,
  restoreZeroTaskForUI,
  updateZeroTaskForUI,
} from "@/server/ui/zero-actions";

const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: taskStatusSchema,
});

const moveBacklogTasksSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(50)
    .transform((ids) => [...new Set(ids)]),
});

const updateFieldsSchema = z
  .object({
    id: z.string().min(1),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    assigneeId: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      data.status ||
      data.priority ||
      typeof data.title !== "undefined" ||
      typeof data.description !== "undefined" ||
      typeof data.assigneeId !== "undefined",
    {
      message: "At least one field must be provided.",
    }
  );

const addCommentSchema = z.object({
  taskId: z.string().min(1),
  text: z.string().min(1).max(2000),
  authorName: z.string().max(120).optional(),
});

const taskDeleteSchema = z.object({
  taskId: z.string().min(1),
});

function buildDescription(base: string | null | undefined, extra: string[]) {
  const cleanBase = (base ?? "").trim();
  const cleanExtra = extra.map((x) => x.trim()).filter(Boolean);

  if (!cleanBase && cleanExtra.length === 0) return null;
  if (!cleanBase) return cleanExtra.join("\n\n");
  if (cleanExtra.length === 0) return cleanBase;
  return `${cleanBase}\n\n${cleanExtra.join("\n\n")}`;
}

async function broadcastTaskEvent(
  projectId: string,
  workspaceId: string,
  event: RealtimeEvent
) {
  await Promise.all([
    sseManager.broadcast(projectId, event),
    sseManager.broadcast(`workspace:${workspaceId}`, event),
  ]);
}

async function canManageTaskDeletion(params: {
  taskId: string;
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  workspaceId: string;
}) {
  if (usesZeroUiStore()) {
    const task = await getZeroTaskDeletionPermission({
      userID: params.currentUser.id,
      workspaceID: params.workspaceId,
      issueID: params.taskId,
    });
    const access = await getProjectAccess(
      params.currentUser,
      task.projectId,
      {
        workspaceId: params.workspaceId,
        includeArchived: true,
      }
    );
    if (!access) {
      return { ok: false as const, formError: "Недоступно" };
    }
    const isCreator = task.creatorId === params.currentUser.id;
    const canManageProject = projectRoleAtLeast(
      access.role,
      ProjectRole.ADMIN
    );
    const creatorCanDelete =
      isCreator && projectRoleAtLeast(access.role, ProjectRole.MEMBER);
    if (!creatorCanDelete && !canManageProject) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }
    return { ok: true as const, task };
  }

  const task = await prisma.task.findFirst({
    where: { id: params.taskId },
    select: {
      id: true,
      key: true,
      status: true,
      projectId: true,
      creatorId: true,
      isDeleted: true,
      project: { select: { workspaceId: true } },
    },
  });

  if (!task || task.project.workspaceId !== params.workspaceId) {
    return { ok: false as const, formError: "Недоступно" };
  }

  const access = await getProjectAccess(params.currentUser, task.projectId, {
    workspaceId: params.workspaceId,
    includeArchived: true,
  });
  if (!access) {
    return { ok: false as const, formError: "Недоступно" };
  }

  const isCreator = task.creatorId === params.currentUser.id;
  const canManageProject = projectRoleAtLeast(access.role, ProjectRole.ADMIN);
  const creatorCanDelete =
    isCreator && projectRoleAtLeast(access.role, ProjectRole.MEMBER);

  if (!creatorCanDelete && !canManageProject) {
    return { ok: false as const, formError: "Недостаточно прав" };
  }

  return { ok: true as const, task };
}

export async function createTaskAction(data: TaskInput) {
  try {
    const validated = taskSchema.parse(data);
    const authUser = await getCurrentUser();
    if (!authUser) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const access = await hasProjectRole(
      authUser,
      validated.projectId,
      ProjectRole.MEMBER,
      { workspaceId }
    );
    if (!access) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const extraBlocks = [
      validated.steps ? `Шаги:\n${validated.steps}` : "",
      validated.expected ? `Ожидаемое:\n${validated.expected}` : "",
      validated.actual ? `Фактическое:\n${validated.actual}` : "",
      validated.environment ? `Окружение:\n${validated.environment}` : "",
    ].filter(Boolean);
    const finalDescription = buildDescription(
      validated.description,
      extraBlocks
    );

    if (usesZeroUiStore()) {
      if (validated.attachments.length > 0) {
        return {
          ok: false as const,
          formError:
            "Добавьте вложения после создания задачи — они загружаются в приватное S3.",
        };
      }
      if (
        validated.assigneeId &&
        !(await canAssignUserToProject(
          validated.assigneeId,
          validated.projectId
        ))
      ) {
        return {
          ok: false as const,
          formError: "Исполнитель не имеет доступа к проекту",
        };
      }
      const created = await createZeroTaskForUI({
        user: authUser,
        workspaceID: workspaceId,
        projectID: validated.projectId,
        title: validated.title,
        description: finalDescription,
        type: validated.type,
        priority: validated.priority,
        status: validated.status,
        tags: validated.tags,
        assigneeID: validated.assigneeId ?? null,
      });
      await broadcastTaskEvent(created.projectId, workspaceId, {
        type: "task_created",
        payload: {
          task: {
            id: created.id,
            projectId: created.projectId,
            key: created.key,
            title: created.title,
            description: created.description,
            type: created.type,
            priority: created.priority,
            status: created.status,
            assigneeId: created.assigneeId,
            requesterName: created.requesterName,
            createdAt: created.createdAt.toISOString(),
          },
        },
      });
      revalidatePath("/board");
      revalidatePath("/backlog");
      revalidatePath("/issues");
      return { ok: true as const, id: created.id, key: created.key };
    }

    const project = await prisma.project.findFirst({
      where: { id: validated.projectId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        key: true,
        nextIssueNumber: true,
        archivedAt: true,
      },
    });

    if (!project) {
      return { ok: false as const, formError: "Project not found" };
    }
    if (project.archivedAt) {
      return { ok: false as const, formError: "Проект архивирован" };
    }

    if (
      validated.assigneeId &&
      !(await canAssignUserToProject(validated.assigneeId, project.id))
    ) {
      return { ok: false as const, formError: "Исполнитель не имеет доступа к проекту" };
    }

    if (validated.attachments.length > 0) {
      const storedNames = validated.attachments.map(
        (attachment) => attachment.split("/").pop() ?? ""
      );
      const uniqueStoredNames = [...new Set(storedNames)];
      const uploadCount = await prisma.upload.count({
        where: {
          storedName: { in: uniqueStoredNames },
          projectId: project.id,
          uploadedById: authUser.id,
        },
      });
      if (
        uniqueStoredNames.length !== storedNames.length ||
        uploadCount !== uniqueStoredNames.length
      ) {
        return { ok: false as const, formError: "Некорректные вложения" };
      }
    }

    const effectiveReporterId = authUser.id;

    const txResult = await prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { nextIssueNumber: { increment: 1 } },
        select: { id: true, key: true, nextIssueNumber: true },
      });

      const nextNumber = updatedProject.nextIssueNumber - 1;
      const taskKey = `${updatedProject.key}-${nextNumber}`;

      const created = await tx.task.create({
        data: {
          title: validated.title,
          description: finalDescription,

          type: validated.type,
          priority: validated.priority,
          status: validated.status,

          tags: validated.tags,
          attachments: validated.attachments,

          dueDate: validated.dueDate ?? null,

          reporterId: effectiveReporterId,
          creatorId: authUser.id,
          assigneeId: validated.assigneeId ?? null,

          requesterName: null,
          requesterEmail: null,

          projectId: updatedProject.id,
          number: nextNumber,
          key: taskKey,
        },
        select: {
          id: true,
          projectId: true,
          key: true,
          title: true,
          description: true,
          type: true,
          priority: true,
          status: true,
          assigneeId: true,
          requesterName: true,
          createdAt: true,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: created.id,
          type: ActivityType.CREATED,
          userId: authUser.id,
          authorName: null,
        },
        select: { id: true },
      });

      return {
        id: created.id,
        key: taskKey,
        projectId: created.projectId,
        title: created.title,
        description: created.description,
        type: created.type,
        priority: created.priority,
        status: created.status,
        assigneeId: created.assigneeId,
        requesterName: created.requesterName,
        createdAt: created.createdAt,
      };
    });

    await broadcastTaskEvent(txResult.projectId, project.workspaceId, {
      type: "task_created",
      payload: {
        task: {
          id: txResult.id,
          projectId: txResult.projectId,
          key: txResult.key,
          title: txResult.title,
          description: txResult.description,
          type: txResult.type,
          priority: txResult.priority,
          status: txResult.status,
          assigneeId: txResult.assigneeId,
          requesterName: txResult.requesterName,
          createdAt: txResult.createdAt.toISOString(),
        },
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const, id: txResult.id, key: txResult.key };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Произошла ошибка при создании задачи." };
  }
}

export async function updateTaskStatusAction(data: {
  id: string;
  status: z.infer<typeof taskStatusSchema>;
}) {
  try {
    const validatedData = updateStatusSchema.parse(data);
    const authUser = await getCurrentUser();
    if (!authUser) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    if (usesZeroUiStore()) {
      const { task } = await updateZeroTaskForUI({
        user: authUser,
        workspaceID: workspaceId,
        issueID: validatedData.id,
        status: validatedData.status,
      });
      await broadcastTaskEvent(task.projectId, workspaceId, {
        type: "task_updated",
        payload: {
          task: {
            id: task.id,
            projectId: task.projectId,
            key: task.key,
            title: task.title,
            description: task.description,
            type: task.type,
            priority: task.priority,
            status: task.status,
            assigneeId: task.assigneeId,
            requesterName: task.requesterName,
            createdAt: task.createdAt.toISOString(),
          },
        },
      });
      revalidatePath("/board");
      revalidatePath("/backlog");
      revalidatePath("/issues");
      return { ok: true as const };
    }

    const taskProject = await prisma.task.findFirst({
      where: { id: validatedData.id, isDeleted: false },
      select: {
        projectId: true,
        project: { select: { workspaceId: true } },
      },
    });
    if (taskProject?.project?.workspaceId !== workspaceId) {
      return { ok: false as const, formError: "Недоступно" };
    }

    const access = await hasProjectRole(
      authUser,
      taskProject.projectId,
      ProjectRole.MEMBER,
      { workspaceId }
    );
    if (!access) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const existing = await prisma.task.findUnique({
      where: { id: validatedData.id },
      select: { status: true },
    });

    const updatedTask = await prisma.task.update({
      where: { id: validatedData.id },
      data: { status: validatedData.status },
      select: {
        id: true,
        projectId: true,
        key: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        assigneeId: true,
        requesterName: true,
        createdAt: true,
      },
    });

    if (existing?.status && existing.status !== validatedData.status) {
      await prisma.taskActivity.create({
        data: {
          taskId: validatedData.id,
          type: ActivityType.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: validatedData.status,
          userId: authUser.id,
          authorName: null,
        },
        select: { id: true },
      });
    }

    await broadcastTaskEvent(updatedTask.projectId, taskProject.project.workspaceId, {
      type: "task_updated",
      payload: {
        task: {
          id: updatedTask.id,
          projectId: updatedTask.projectId,
          key: updatedTask.key,
          title: updatedTask.title,
          description: updatedTask.description,
          type: updatedTask.type,
          priority: updatedTask.priority,
          status: updatedTask.status,
          assigneeId: updatedTask.assigneeId,
          requesterName: updatedTask.requesterName,
          createdAt: updatedTask.createdAt.toISOString(),
        },
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось обновить статус." };
  }
}

export async function moveBacklogTasksToTodoAction(data: {
  ids: string[];
}) {
  try {
    const { ids } = moveBacklogTasksSchema.parse(data);
    const authUser = await getCurrentUser();
    if (!authUser) {
      return {
        ok: false as const,
        formError: "Требуется авторизация",
        code: "AUTH_REQUIRED",
      };
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return {
        ok: false as const,
        formError: "Требуется авторизация",
        code: "AUTH_REQUIRED",
      };
    }

    if (usesZeroUiStore()) {
      const backlogIssues = await Promise.all(
        ids.map((issueID) =>
          getZeroTaskDeletionPermission({
            userID: authUser.id,
            workspaceID: workspaceId,
            issueID,
          })
        )
      );
      if (
        backlogIssues.some(
          (issue) => issue.isDeleted || issue.status !== Status.NEW
        )
      ) {
        return {
          ok: false as const,
          formError: "Часть задач уже перемещена или недоступна.",
        };
      }

      const results = await Promise.all(
        ids.map((issueID) =>
          updateZeroTaskForUI({
            user: authUser,
            workspaceID: workspaceId,
            issueID,
            status: Status.TODO,
          })
        )
      );
      const tasks = results.map(({ task }) => task);

      await Promise.all(
        tasks.map((task) =>
          broadcastTaskEvent(task.projectId, workspaceId, {
            type: "task_updated",
            payload: {
              task: {
                id: task.id,
                projectId: task.projectId,
                key: task.key,
                title: task.title,
                description: task.description,
                type: task.type,
                priority: task.priority,
                status: task.status,
                assigneeId: task.assigneeId,
                requesterName: task.requesterName,
                createdAt: task.createdAt.toISOString(),
              },
            },
          })
        )
      );

      revalidatePath("/board");
      revalidatePath("/backlog");
      revalidatePath("/issues");
      return { ok: true as const, movedCount: tasks.length };
    }

    const backlogTasks = await prisma.task.findMany({
      where: {
        id: { in: ids },
        isDeleted: false,
        status: Status.NEW,
        project: { workspaceId },
      },
      select: {
        id: true,
        projectId: true,
      },
    });
    if (backlogTasks.length !== ids.length) {
      return {
        ok: false as const,
        formError: "Часть задач уже перемещена или недоступна.",
      };
    }

    const projectIds = [...new Set(backlogTasks.map((task) => task.projectId))];
    const access = await Promise.all(
      projectIds.map((projectId) =>
        hasProjectRole(authUser, projectId, ProjectRole.MEMBER, {
          workspaceId,
        })
      )
    );
    if (access.some((role) => !role)) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const updatedTasks = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: {
          id: { in: ids },
          isDeleted: false,
          status: Status.NEW,
        },
        data: { status: Status.TODO },
      });
      if (updated.count !== ids.length) {
        throw new Error("Backlog selection changed");
      }
      await tx.taskActivity.createMany({
        data: ids.map((taskId) => ({
          taskId,
          type: ActivityType.STATUS_CHANGED,
          fromStatus: Status.NEW,
          toStatus: Status.TODO,
          userId: authUser.id,
          authorName: null,
        })),
      });
      return tx.task.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          projectId: true,
          key: true,
          title: true,
          description: true,
          type: true,
          priority: true,
          status: true,
          assigneeId: true,
          requesterName: true,
          createdAt: true,
        },
      });
    });

    await Promise.all(
      updatedTasks.map((task) =>
        broadcastTaskEvent(task.projectId, workspaceId, {
          type: "task_updated",
          payload: {
            task: {
              id: task.id,
              projectId: task.projectId,
              key: task.key,
              title: task.title,
              description: task.description,
              type: task.type,
              priority: task.priority,
              status: task.status,
              assigneeId: task.assigneeId,
              requesterName: task.requesterName,
              createdAt: task.createdAt.toISOString(),
            },
          },
        })
      )
    );

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");
    return { ok: true as const, movedCount: updatedTasks.length };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return {
      ok: false as const,
      formError: "Не удалось переместить выбранные задачи.",
    };
  }
}

export async function updateTaskFieldsAction(data: {
  id: string;
  status?: z.infer<typeof taskStatusSchema>;
  priority?: TaskPriority;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
}) {
  try {
    const validatedData = updateFieldsSchema.parse(data);
    const authUser = await getCurrentUser();
    if (!authUser) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    if (usesZeroUiStore()) {
      if (
        validatedData.assigneeId &&
        !(await canAssignUserToProject(
          validatedData.assigneeId,
          (
            await getZeroTaskDeletionPermission({
              userID: authUser.id,
              workspaceID: workspaceId,
              issueID: validatedData.id,
            })
          ).projectId
        ))
      ) {
        return {
          ok: false as const,
          formError: "Исполнитель не имеет доступа к проекту",
        };
      }
      const { task } = await updateZeroTaskForUI({
        user: authUser,
        workspaceID: workspaceId,
        issueID: validatedData.id,
        status: validatedData.status,
        priority: validatedData.priority,
        title: validatedData.title,
        description: validatedData.description,
        assigneeID: validatedData.assigneeId,
      });
      await broadcastTaskEvent(task.projectId, workspaceId, {
        type: "task_updated",
        payload: {
          task: {
            id: task.id,
            projectId: task.projectId,
            key: task.key,
            title: task.title,
            description: task.description,
            type: task.type,
            priority: task.priority,
            status: task.status,
            assigneeId: task.assigneeId,
            requesterName: task.requesterName,
            createdAt: task.createdAt.toISOString(),
          },
        },
      });
      revalidatePath(`/tasks/${task.key}`);
      revalidatePath("/board");
      revalidatePath("/backlog");
      revalidatePath("/issues");
      return { ok: true as const };
    }

    const taskProject = await prisma.task.findFirst({
      where: { id: validatedData.id, isDeleted: false },
      select: {
        projectId: true,
        project: { select: { workspaceId: true } },
      },
    });
    if (taskProject?.project?.workspaceId !== workspaceId) {
      return { ok: false as const, formError: "Недоступно" };
    }

    const access = await hasProjectRole(
      authUser,
      taskProject.projectId,
      ProjectRole.MEMBER,
      { workspaceId }
    );
    if (!access) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    if (
      validatedData.assigneeId &&
      !(await canAssignUserToProject(
        validatedData.assigneeId,
        taskProject.projectId
      ))
    ) {
      return { ok: false as const, formError: "Исполнитель не имеет доступа к проекту" };
    }

    const existing = await prisma.task.findUnique({
      where: { id: validatedData.id },
      select: { status: true, key: true },
    });

    const updated = await prisma.task.update({
      where: { id: validatedData.id },
      data: {
        status: validatedData.status,
        priority: validatedData.priority,
        title: validatedData.title,
        description: validatedData.description,
        assigneeId:
          typeof validatedData.assigneeId !== "undefined"
            ? validatedData.assigneeId
            : undefined,
      },
      select: {
        id: true,
        projectId: true,
        key: true,
        title: true,
        description: true,
        type: true,
        priority: true,
        status: true,
        assigneeId: true,
        requesterName: true,
        createdAt: true,
      },
    });

    if (
      typeof validatedData.status !== "undefined" &&
      existing?.status &&
      existing.status !== validatedData.status
    ) {
      await prisma.taskActivity.create({
        data: {
          taskId: validatedData.id,
          type: ActivityType.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: validatedData.status,
          userId: authUser.id,
          authorName: null,
        },
        select: { id: true },
      });
    }

    await broadcastTaskEvent(taskProject.projectId, taskProject.project.workspaceId, {
      type: "task_updated",
      payload: {
        task: {
          id: updated.id,
          projectId: updated.projectId,
          key: updated.key,
          title: updated.title,
          description: updated.description,
          type: updated.type,
          priority: updated.priority,
          status: updated.status,
          assigneeId: updated.assigneeId,
          requesterName: updated.requesterName,
          createdAt: updated.createdAt.toISOString(),
        },
      },
    });

    revalidatePath(`/tasks/${updated.key ?? validatedData.id}`);
    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось обновить задачу." };
  }
}

export async function addCommentAction(data: {
  taskId: string;
  text: string;
  authorName?: string;
}) {
  try {
    const validatedData = addCommentSchema.parse(data);
    const authUser = await getCurrentUser();
    if (!authUser) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    if (usesZeroUiStore()) {
      const createdComment = await addZeroCommentForUI({
        user: authUser,
        workspaceID: workspaceId,
        issueID: validatedData.taskId,
        text: validatedData.text,
      });
      const task = await getZeroTaskDeletionPermission({
        userID: authUser.id,
        workspaceID: workspaceId,
        issueID: validatedData.taskId,
      });
      await broadcastTaskEvent(task.projectId, workspaceId, {
        type: "comment_added",
        payload: {
          projectId: task.projectId,
          comment: {
            id: createdComment.id,
            taskId: createdComment.taskId,
            text: createdComment.text,
            userId: createdComment.userId,
            authorName: createdComment.authorName,
            createdAt: new Date(createdComment.createdAt).toISOString(),
          },
        },
      });
      revalidatePath(`/tasks/${task.key}`);
      revalidatePath("/board");
      revalidatePath("/backlog");
      revalidatePath("/issues");
      return { ok: true as const };
    }

    const taskProject = await prisma.task.findFirst({
      where: { id: validatedData.taskId, isDeleted: false },
      select: {
        projectId: true,
        project: { select: { workspaceId: true } },
      },
    });
    if (taskProject?.project?.workspaceId !== workspaceId) {
      return { ok: false as const, formError: "Недоступно" };
    }

    const access = await hasProjectRole(
      authUser,
      taskProject.projectId,
      ProjectRole.MEMBER,
      { workspaceId }
    );
    if (!access) {
      return { ok: false as const, formError: "Недостаточно прав" };
    }

    const createdComment = await prisma.comment.create({
      data: {
        taskId: validatedData.taskId,
        text: validatedData.text,
        userId: authUser.id,
        authorName: null,
      },
      select: {
        id: true,
        taskId: true,
        text: true,
        userId: true,
        authorName: true,
        createdAt: true,
      },
    });

    if (taskProject?.projectId) {
      await broadcastTaskEvent(taskProject.projectId, taskProject.project.workspaceId, {
        type: "comment_added",
        payload: {
          projectId: taskProject.projectId,
          comment: {
            id: createdComment.id,
            taskId: createdComment.taskId,
            text: createdComment.text,
            userId: createdComment.userId,
            authorName: createdComment.authorName,
            createdAt: createdComment.createdAt.toISOString(),
          },
        },
      });
    }

    const task = await prisma.task.findUnique({
      where: { id: validatedData.taskId },
      select: { key: true },
    });

    revalidatePath(`/tasks/${task?.key ?? validatedData.taskId}`);
    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось добавить комментарий." };
  }
}

export async function deleteTaskAction(taskId: string) {
  try {
    const validated = taskDeleteSchema.parse({ taskId });
    const authUser = await getCurrentUser();
    if (!authUser) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const permission = await canManageTaskDeletion({
      taskId: validated.taskId,
      currentUser: authUser,
      workspaceId,
    });

    if (!permission.ok) return permission;
    if (permission.task.isDeleted) return { ok: true as const };

    if (usesZeroUiStore()) {
      await archiveZeroTaskForUI({
        userID: authUser.id,
        issueID: permission.task.id,
      });
    } else {
      await prisma.task.update({
        where: { id: permission.task.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
        select: { id: true },
      });
    }

    await broadcastTaskEvent(permission.task.projectId, workspaceId, {
      type: "task_deleted",
      payload: {
        taskId: permission.task.id,
        projectId: permission.task.projectId,
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");
    revalidatePath("/trash");
    revalidatePath(`/tasks/${permission.task.key ?? permission.task.id}`);

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось удалить задачу." };
  }
}

export async function restoreTaskAction(taskId: string) {
  try {
    const validated = taskDeleteSchema.parse({ taskId });
    const authUser = await getCurrentUser();
    if (!authUser) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return { ok: false as const, formError: "Требуется авторизация", code: "AUTH_REQUIRED" };
    }

    const permission = await canManageTaskDeletion({
      taskId: validated.taskId,
      currentUser: authUser,
      workspaceId,
    });

    if (!permission.ok) return permission;
    if (!permission.task.isDeleted) return { ok: true as const };

    const restored = usesZeroUiStore()
      ? await restoreZeroTaskForUI({
          userID: authUser.id,
          workspaceID: workspaceId,
          issueID: permission.task.id,
          projectID: permission.task.projectId,
        })
      : await prisma.task.update({
          where: { id: permission.task.id },
          data: {
            isDeleted: false,
            deletedAt: null,
          },
          select: {
            id: true,
            projectId: true,
            key: true,
            title: true,
            description: true,
            type: true,
            priority: true,
            status: true,
            assigneeId: true,
            requesterName: true,
            createdAt: true,
          },
        });

    await broadcastTaskEvent(restored.projectId, workspaceId, {
      type: "task_restored",
      payload: {
        taskId: restored.id,
        projectId: restored.projectId,
        task: {
          id: restored.id,
          projectId: restored.projectId,
          key: restored.key,
          title: restored.title,
          description: restored.description,
          type: restored.type,
          priority: restored.priority,
          status: restored.status,
          assigneeId: restored.assigneeId,
          requesterName: restored.requesterName,
          createdAt: restored.createdAt.toISOString(),
        },
      },
    });

    revalidatePath("/board");
    revalidatePath("/backlog");
    revalidatePath("/issues");
    revalidatePath("/trash");
    revalidatePath(`/tasks/${restored.key ?? restored.id}`);

    return { ok: true as const };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false as const, fieldErrors: error.flatten().fieldErrors };
    }
    return { ok: false as const, formError: "Не удалось восстановить задачу." };
  }
}
