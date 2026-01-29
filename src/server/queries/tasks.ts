import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import type { IssueFilters } from "../validators/issueFilters";


export const buildTaskWhere = (filters: IssueFilters): Prisma.TaskWhereInput => {
  const where: Prisma.TaskWhereInput = {};

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
      { key: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status?.length) {
    const statusSet = new Set(filters.status);
  
    // для запроса в БД расширяем список статусов строками legacy-значений
    const dbStatuses: string[] = Array.from(statusSet);
  
    // legacy: "Open" считаем как "New"
    if (statusSet.has("New")) {
      dbStatuses.push("Open");
    }
  
    where.status = { in: dbStatuses };
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

export async function getTasks(filters: IssueFilters) {
  return prisma.task.findMany({
    where: buildTaskWhere(filters),
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestTasks(limit = 10) {
  return prisma.task.findMany({
    include: { project: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getAllTasks() {
  return prisma.task.findMany({
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTaskById(id: string) {
  return prisma.task.findUnique({
    include: { project: true },
    where: { id },
  });
}

export async function getTaskByKey(key: string) {
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

