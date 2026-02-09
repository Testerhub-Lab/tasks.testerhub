import SidebarClient from "./SidebarClient";
import { getProjects } from "@/server/queries/projects";
import { getBacklogUnreadCount } from "@/server/queries/tasks";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getOrCreateDefaultWorkspace, getWorkspacesForUser } from "@/server/queries/workspaces";
import prisma from "@/lib/prisma";

export default async function Sidebar() {
  const user = await getCurrentUser();
  const workspaceId = await getCurrentWorkspaceId();
  const projects = await getProjects(workspaceId);
  const workspaces = user
    ? await getWorkspacesForUser(user.id)
    : [{ workspace: await getOrCreateDefaultWorkspace() }];
  let backlogUnread = 0;
  let canManageWorkspace = false;

  if (user) {
    const meta = await prisma.user.findUnique({
      where: { id: user.id },
      select: { lastSeenBacklogAt: true },
    });
    backlogUnread = await getBacklogUnreadCount(meta?.lastSeenBacklogAt ?? null, workspaceId);

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      select: { role: true },
    });
    canManageWorkspace = membership?.role === "ADMIN";
  }

  return (
    <SidebarClient
      projects={projects}
      backlogUnread={backlogUnread}
      workspaces={workspaces.map((m) => m.workspace)}
      currentWorkspaceId={workspaceId}
      canManageWorkspace={canManageWorkspace}
    />
  );
}
