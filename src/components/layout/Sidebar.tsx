import SidebarClient from "./SidebarClient";
import { getProjects } from "@/server/queries/projects";
import { getBacklogUnreadCount } from "@/server/queries/tasks";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getWorkspacesForUser } from "@/server/queries/workspaces";
import {
  getAccessibleProjectIds,
  getWorkspaceRole,
} from "@/server/auth/access";
import prisma from "@/lib/prisma";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";

export default async function Sidebar() {
  const user = await getCurrentUser();
  if (!user) return null;
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return null;
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId);
  const projects = await getProjects(workspaceId, user);
  const workspaces = await getWorkspacesForUser(user.id);
  let backlogUnread = 0;
  let canManageWorkspace = false;
  let canManageProjects = false;

  if (usesZeroUiStore()) {
    const workspaceRole = await getWorkspaceRole(user, workspaceId);
    canManageWorkspace = workspaceRole === "ADMIN";
    canManageProjects =
      canManageWorkspace ||
      projects.some((project) => project.accessRole === "ADMIN");
  } else {
    const meta = await prisma.user.findUnique({
      where: { id: user.id },
      select: { lastSeenBacklogAt: true },
    });
    backlogUnread = await getBacklogUnreadCount(
      meta?.lastSeenBacklogAt ?? null,
      accessibleProjectIds
    );

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      select: { role: true },
    });
    canManageWorkspace = membership?.role === "ADMIN" || user.role === "ADMIN";
    canManageProjects =
      canManageWorkspace ||
      (await prisma.projectMember.count({
        where: {
          userId: user.id,
          projectId: { in: accessibleProjectIds },
          role: "ADMIN",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      })) > 0;
  }

  return (
    <SidebarClient
      projects={projects}
      backlogUnread={backlogUnread}
      workspaces={workspaces.map((m) => m.workspace)}
      currentWorkspaceId={workspaceId}
      canManageWorkspace={canManageWorkspace}
      canManageProjects={canManageProjects}
    />
  );
}
