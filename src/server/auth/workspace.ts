"use server";

import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "./session";
import { getOrCreateDefaultWorkspace, getOrCreatePersonalWorkspace } from "../queries/workspaces";

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

  // Сериализуем создание личного воркспейса по userId, чтобы Sidebar/TopBar не создали по два
  let lock = createPersonalWorkspaceLocks.get(user.id);
  if (!lock) {
    lock = (async () => {
      try {
        const ws = await getOrCreatePersonalWorkspace({
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
