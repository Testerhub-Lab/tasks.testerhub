import prisma from "../../lib/prisma";

const DEFAULT_PROJECT = {
  key: "TH",
  name: "TesterHub",
};

export async function getOrCreateDefaultProject() {
  const existing = await prisma.project.findUnique({
    where: { key: DEFAULT_PROJECT.key },
  });
  if (existing) {
    return existing;
  }
  return prisma.project.create({
    data: DEFAULT_PROJECT,
  });
}

export async function getProjects() {
  return prisma.project.findMany({
    select: { id: true, name: true, key: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getProjectById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, key: true },
  });
}
