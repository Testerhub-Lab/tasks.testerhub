import prisma from "../../lib/prisma";

export async function getLatestTasks(limit = 10) {
  return prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getAllTasks() {
  return prisma.task.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getTaskById(id: string) {
  return prisma.task.findUnique({
    where: { id },
  });
}
