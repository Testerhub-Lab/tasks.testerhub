"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "../auth/session";
import { setCurrentWorkspaceId } from "../auth/workspace";

export async function setWorkspaceAction(workspaceId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { workspaceId: true },
  });

  if (!membership) return { ok: false as const };

  await setCurrentWorkspaceId(workspaceId);
  return { ok: true as const };
}
