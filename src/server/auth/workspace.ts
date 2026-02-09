"use server";

import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "./session";
import { createPersonalWorkspace, getOrCreateDefaultWorkspace } from "../queries/workspaces";

const WORKSPACE_COOKIE = "th_workspace";

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

  // legacy fallback: if user has activity in default workspace, attach them there
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
}

export async function setCurrentWorkspaceId(workspaceId: string) {
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}
