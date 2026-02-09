import prisma from "../../lib/prisma";
import { getOrCreateDefaultWorkspace } from "./workspaces";

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

export async function getProjects(workspaceId: string) {
  return prisma.project.findMany({
    where: { workspaceId },
    select: { id: true, name: true, key: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getProjectById(id: string, workspaceId?: string) {
  return prisma.project.findFirst({
    where: { id, ...(workspaceId ? { workspaceId } : {}) },
    select: { id: true, name: true, key: true },
  });
}
