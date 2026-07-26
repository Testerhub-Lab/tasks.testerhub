import React from "react";
import { getProjectById } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import { getCurrentUser } from "../../server/auth/session";
import prisma from "@/lib/prisma";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import IssueDetailsClient from "./IssueDetailsClient";
import {
  getAccessibleProjectIds,
  getProjectAccess,
  projectRoleAtLeast,
} from "@/server/auth/access";
import { ProjectRole } from "@prisma/client";
import {
  getProjectKnowledge,
  getTaskKnowledgeLinks,
  getWikiPageTree,
} from "@/server/knowledge/queries";

interface IssueDetailsProps {
  task: TaskWithProjectAndReporter;
}

const IssueDetails = async ({ task }: IssueDetailsProps) => {
  const [workspaceId, user] = await Promise.all([
    getCurrentWorkspaceId(),
    getCurrentUser(),
  ]);
  if (!workspaceId || !user) return null;
  const project =
    (task as { projectId?: string | null }).projectId
      ? await getProjectById(
          (task as { projectId?: string | null }).projectId!,
          workspaceId,
          user,
          { includeArchived: true }
        )
      : null;
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId, {
    includeArchived: true,
  });
  const users = await getUsersForAssignee(workspaceId, accessibleProjectIds);
  const [membership, projectAccess] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
      select: { role: true },
    }),
    getProjectAccess(user, task.projectId, {
      workspaceId,
      includeArchived: true,
    }),
  ]);

  const canDelete =
    membership?.role === "ADMIN" ||
    user.role === "ADMIN" ||
    (projectAccess
      ? projectRoleAtLeast(projectAccess.role, ProjectRole.ADMIN) ||
        (task.creatorId === user.id &&
          projectRoleAtLeast(projectAccess.role, ProjectRole.MEMBER))
      : false);
  const canEdit = Boolean(
    projectAccess &&
      projectRoleAtLeast(projectAccess.role, ProjectRole.MEMBER)
  );
  const [knowledge, knowledgeLinks] = await Promise.all([
    getProjectKnowledge(task.projectId),
    getTaskKnowledgeLinks(task.id),
  ]);
  const wikiPages =
    knowledge.provider === "NATIVE"
      ? await getWikiPageTree(task.projectId)
      : [];

  const projectLabel = project ? `${project.key} — ${project.name}` : null;

  return (
    <IssueDetailsClient
      task={task}
      projectLabel={projectLabel}
      users={users}
      canEdit={canEdit}
      canDelete={Boolean(canDelete)}
      knowledge={{
        provider: knowledge.provider,
        externalUrl: knowledge.externalUrl,
        projectKey: project?.key ?? "",
        pages: wikiPages.map((page) => ({ id: page.id, title: page.title })),
        links: knowledgeLinks.map((link) => ({
          id: link.id,
          documentKey: link.documentKey,
          title: link.title,
          url: link.url,
        })),
      }}
    />
  );
};

export default IssueDetails;
