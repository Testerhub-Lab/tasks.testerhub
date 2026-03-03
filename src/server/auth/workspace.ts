"use server";

import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "./session";
import { createPersonalWorkspace, getOrCreateDefaultWorkspace } from "../queries/workspaces";

const WORKSPACE_COOKIE = "th_workspace";

/** Один раз на пользователя: не даём параллельным запросам создать несколько личных воркспейсов */
const createPersonalWorkspaceLocks = new Map<string, Promise<string>>();

export async function getCurrentWorkspaceId() {
  const jar = await cookies();
  const cookieId = jar.get(WORKSPACE_COOKIE)?.value ?? null;
  const user = await getCurrentUser();

  if (!user) {
    const ws = await getOrCreateDefaultWorkspace();
    return ws.id;
  }

  if (cookieId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: cookieId, userId: user.id } },
      select: { workspaceId: true },
    });
    if (membership) return membership.workspaceId;
  }

  const first = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });

  if (first) return first.workspaceId;

  // Сериализуем создание личного воркспейса по userId, чтобы Sidebar/TopBar не создали по два
  let lock = createPersonalWorkspaceLocks.get(user.id);
  if (!lock) {
    lock = (async () => {
      try {
        const again = await prisma.workspaceMember.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { workspaceId: true },
        });
        if (again) return again.workspaceId;

        const defaultWs = await getOrCreateDefaultWorkspace();
        const legacyTask = await prisma.task.findFirst({
          where: {
            project: { workspaceId: defaultWs.id },
            OR: [{ reporterId: user.id }, { assigneeId: user.id }],
          },
          select: { id: true },
        });
        const legacyComment = legacyTask
          ? null
          : await prisma.comment.findFirst({
              where: { userId: user.id, task: { project: { workspaceId: defaultWs.id } } },
              select: { id: true },
            });

        if (legacyTask || legacyComment) {
          await prisma.workspaceMember.create({
            data: { workspaceId: defaultWs.id, userId: user.id, role: "ADMIN" },
          });
          return defaultWs.id;
        }

        const ws = await createPersonalWorkspace({
          userId: user.id,
          name: user.name ? `${user.name}'s Workspace` : null,
        });
        return ws.id;
      } finally {
        createPersonalWorkspaceLocks.delete(user.id);
      }
    })();
    createPersonalWorkspaceLocks.set(user.id, lock);
  }

  return lock;
}

export async function setCurrentWorkspaceId(workspaceId: string) {
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}
