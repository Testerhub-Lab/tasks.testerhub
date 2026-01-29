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

export const buildTaskWhere = (filters: IssueFilters): Prisma.TaskWhereInput => {
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

  return where;
};

export async function getTasks(filters: IssueFilters): Promise<TaskWithProject[]> {
  return prisma.task.findMany({
    where: buildTaskWhere(filters),
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestTasks(limit = 10): Promise<TaskWithProject[]> {
  return prisma.task.findMany({
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getAllTasks(): Promise<TaskWithProject[]> {
  return prisma.task.findMany({
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTaskById(id: string): Promise<TaskWithProject | null> {
  return prisma.task.findUnique({
    include: { project: true },
    where: { id },
  });
}

export async function getTaskByKey(key: string): Promise<TaskWithProject | null> {
  return prisma.task.findUnique({
    include: { project: true },
    where: { key },
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
