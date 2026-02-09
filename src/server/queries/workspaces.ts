import prisma from "@/lib/prisma";

const DEFAULT_WORKSPACE = {
  id: "default",
  name: "Default workspace",
  slug: "default",
};

export async function getOrCreateDefaultWorkspace() {
  const existing = await prisma.workspace.findUnique({
    where: { id: DEFAULT_WORKSPACE.id },
  });
  if (existing) return existing;
  return prisma.workspace.create({
    data: DEFAULT_WORKSPACE,
  });
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export async function createPersonalWorkspace(params: {
  userId: string;
  name?: string | null;
}) {
  const baseName = (params.name ?? "").trim() || "My Workspace";
  const baseSlug = slugify(baseName) || "workspace";
  const suffix = Math.random().toString(36).slice(2, 8);
  const slug = `${baseSlug}-${suffix}`;

  const ws = await prisma.workspace.create({
    data: {
      name: baseName,
      slug,
    },
  });

  await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: params.userId, role: "ADMIN" },
  });

  return ws;
}

export async function getWorkspacesForUser(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getWorkspaceById(id: string) {
  return prisma.workspace.findUnique({
    where: { id },
  });
}

export async function getWorkspaceBySlug(slug: string) {
  return prisma.workspace.findUnique({
    where: { slug },
  });
}
