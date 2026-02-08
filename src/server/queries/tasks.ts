import prisma from "../../lib/prisma";
import { Status, type Prisma } from "@prisma/client";
import type { IssueFilters } from "../validators/issueFilters";

// Board никогда не показывает NEW
const BOARD_STATUSES = [
  Status.TODO,
  Status.IN_PROGRESS,
  Status.TESTING,
  Status.DONE,
] as const;

export type TaskWithProject = Prisma.TaskGetPayload<{
  include: { project: true };
}>;

export type TaskListItem = Prisma.TaskGetPayload<{
  include: {
    project: true;
    reporter: { select: { id: true; name: true; email: true } };
  };
}>;

export type TaskWithProjectAndReporter = Prisma.TaskGetPayload<{
  include: {
    project: true;
    reporter: { select: { id: true; name: true; email: true } };
  };
}>;

export const buildTaskWhere = (
  filters: IssueFilters,
  currentUserId?: string | null
): Prisma.TaskWhereInput => {
  const where: Prisma.TaskWhereInput = {};

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
      { key: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  // ✅ Канон: Backlog всегда только NEW
  if (filters.view === "backlog") {
    where.status = Status.NEW;
  }
  // ✅ Канон: Board никогда не показывает NEW
  else if (filters.view === "board") {
    where.status = { in: [...BOARD_STATUSES] };
  }
  // ✅ Остальные страницы: если status-фильтр есть — применяем
  else if (filters.status?.length) {
    where.status = { in: filters.status };
  }

  if (filters.priority?.length) {
    where.priority = { in: filters.priority };
  }

  if (filters.tags?.length) {
    where.tags = { hasSome: filters.tags };
  }

  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

  if (filters.assignee) {
    if (filters.assignee === "me") {
      if (currentUserId) {
        where.assigneeId = currentUserId;
      } else {
        where.id = "__no-user__";
      }
    } else {
      where.assigneeId = filters.assignee;
    }
  }

  return where;
};

export async function getTasks(
  filters: IssueFilters,
  currentUserId?: string | null
): Promise<TaskListItem[]> {
  return prisma.task.findMany({
    where: buildTaskWhere(filters, currentUserId),
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestTasks(limit = 10): Promise<TaskListItem[]> {
  return prisma.task.findMany({
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getAllTasks(): Promise<TaskListItem[]> {
  return prisma.task.findMany({
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBacklogUnreadCount(since?: Date | null) {
  const sinceDate = since ?? new Date(0);
  return prisma.task.count({
    where: {
      status: Status.NEW,
      createdAt: { gt: sinceDate },
    },
  });
}

export async function getTaskById(id: string): Promise<TaskWithProjectAndReporter | null> {
  return prisma.task.findUnique({
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
    },
    where: { id },
  });
}

export async function getTaskByKey(key: string): Promise<TaskWithProjectAndReporter | null> {
  return prisma.task.findUnique({
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
    },
    where: { key },
  });
}

export async function getTaskActivitiesByTaskId(taskId: string) {
  return prisma.taskActivity.findMany({
    where: { taskId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCommentsByTaskId(taskId: string) {
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      taskId: true,
      text: true,
      userId: true,
      authorName: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}
