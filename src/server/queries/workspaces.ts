import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
      personalOwnerId: params.userId,
    },
  });

  await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, userId: params.userId, role: "ADMIN" },
  });

  return ws;
}

export async function getOrCreatePersonalWorkspace(params: {
  userId: string;
  name?: string | null;
}) {
  const existing = await prisma.workspace.findUnique({
    where: { personalOwnerId: params.userId },
    select: { id: true },
  });

  if (existing) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: existing.id,
          userId: params.userId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      await prisma.workspaceMember.create({
        data: {
          workspaceId: existing.id,
          userId: params.userId,
          role: "ADMIN",
        },
      });
    }

    return prisma.workspace.findUniqueOrThrow({ where: { id: existing.id } });
  }

  try {
    return await createPersonalWorkspace(params);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.workspace.findUniqueOrThrow({
        where: { personalOwnerId: params.userId },
      });
    }
    throw error;
  }
}

export async function getWorkspacesForUser(userId: string) {
  const now = new Date();
  return prisma.workspaceMember.findMany({
    where: {
      userId,
      OR: [
        { role: "ADMIN" },
        {
          workspace: {
            projects: {
              some: {
                members: {
                  some: {
                    userId,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                },
              },
            },
          },
        },
      ],
    },
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
