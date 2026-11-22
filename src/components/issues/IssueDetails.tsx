import React from "react";
import { getProjectById } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import { getCurrentUser } from "../../server/auth/session";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import IssueDetailsClient from "./IssueDetailsClient";
import IssueHierarchy from "./IssueHierarchy";
import IssueReleaseField from "./IssueReleaseField";
import { getIssueHierarchy } from "@/server/queries/issueHierarchy";
import { getIssueReleaseAssignments, getOpenProjectReleases } from "@/server/queries/releases";
import {
  getAccessibleProjectIds,
  getProjectAccess,
  getWorkspaceRole,
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
  const [project, accessibleProjectIds] = await Promise.all([
    (task as { projectId?: string | null }).projectId
      ? getProjectById(
          (task as { projectId?: string | null }).projectId!,
          workspaceId,
          user,
          { includeArchived: true }
        )
      : null,
    getAccessibleProjectIds(user, workspaceId, {
      includeArchived: true,
    }),
  ]);
  const [users, workspaceRole, projectAccess, knowledge, knowledgeLinks, hierarchy, releaseAssignments] =
    await Promise.all([
      getUsersForAssignee(workspaceId, accessibleProjectIds),
      getWorkspaceRole(user, workspaceId),
      getProjectAccess(user, task.projectId, {
        workspaceId,
        includeArchived: true,
      }),
      getProjectKnowledge(task.projectId),
      getTaskKnowledgeLinks(task.id),
      getIssueHierarchy(task),
      getIssueReleaseAssignments([task]),
    ]);

  const canDelete =
    workspaceRole === "ADMIN" ||
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
  const release = releaseAssignments[task.id] ?? null;
  const canEditRelease = canEdit && !task.project.archivedAt && !task.isDeleted && release?.status !== "released";
  const [wikiPages, releaseOptions] = await Promise.all([
    knowledge.provider === "NATIVE" ? getWikiPageTree(task.projectId) : [],
    canEditRelease ? getOpenProjectReleases(task.projectId) : [],
  ]);

  const projectLabel = project ? `${project.key} — ${project.name}` : null;

  return (
    <IssueDetailsClient
      task={task}
      projectLabel={projectLabel}
      users={users}
      canEdit={canEdit}
      canDelete={Boolean(canDelete)}
      releaseField={<IssueReleaseField
        key={task.id}
        issueId={task.id}
        projectId={task.projectId}
        projectKey={task.project.archivedAt ? null : task.project.key}
        release={release}
        options={releaseOptions}
      />}
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
    >
      <IssueHierarchy key={task.id} task={{ id: task.id, key: task.key, type: task.type }}
        project={{ id: task.projectId, key: task.project.key, name: task.project.name }}
        hierarchy={hierarchy} users={users} canEdit={canEdit && !task.project.archivedAt && !task.isDeleted} />
    </IssueDetailsClient>
  );
};

export default IssueDetails;
