import SidebarClient from "./SidebarClient";
import { getProjects } from "@/server/queries/projects";
import { getBacklogUnreadCount } from "@/server/queries/tasks";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getWorkspacesForUser } from "@/server/queries/workspaces";
import { getIssueViewPreferences } from "@/server/queries/issueViewPreferences";
import {
  getAccessibleProjectIds,
  getWorkspaceRole,
} from "@/server/auth/access";
import prisma from "@/lib/prisma";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";
import {
  getProjectKnowledge,
  getWikiPageTree,
} from "@/server/knowledge/queries";
import { KnowledgeProvider } from "@prisma/client";

export default async function Sidebar() {
  const user = await getCurrentUser();
  if (!user) return null;
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return null;
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId);
  const [projects, issueViewPreferences] = await Promise.all([
    getProjects(workspaceId, user),
    getIssueViewPreferences({ userId: user.id, workspaceId }),
  ]);
  const wikiPagesByProject = Object.fromEntries(
    await Promise.all(
      projects.map(async (project) => [
        project.id,
        await getWikiPageTree(project.id),
      ])
    )
  );
  const wikiEnabledProjectIds = (
    await Promise.all(
      projects.map(async (project) => {
        const configuration = await getProjectKnowledge(project.id);
        return configuration.provider !== KnowledgeProvider.DISABLED
          ? project.id
          : null;
      })
    )
  ).filter((projectId): projectId is string => Boolean(projectId));
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
      wikiPagesByProject={wikiPagesByProject}
      wikiEnabledProjectIds={wikiEnabledProjectIds}
      issueViewPreferences={issueViewPreferences}
      backlogUnread={backlogUnread}
      workspaces={workspaces.map((m) => m.workspace)}
      currentWorkspaceId={workspaceId}
      canManageWorkspace={canManageWorkspace}
      canManageProjects={canManageProjects}
    />
  );
}
