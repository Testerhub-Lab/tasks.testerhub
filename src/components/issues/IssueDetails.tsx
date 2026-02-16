import React from "react";
import { getProjectById } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import { getCurrentUser } from "../../server/auth/session";
import prisma from "@/lib/prisma";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import IssueDetailsClient from "./IssueDetailsClient";

interface IssueDetailsProps {
  task: TaskWithProjectAndReporter;
}

const IssueDetails = async ({ task }: IssueDetailsProps) => {
  const [workspaceId, user] = await Promise.all([
    getCurrentWorkspaceId(),
    getCurrentUser(),
  ]);
  const project =
    (task as { projectId?: string | null }).projectId
      ? await getProjectById(
          (task as { projectId?: string | null }).projectId!,
          workspaceId,
          { includeArchived: true }
        )
      : null;
  const users = await getUsersForAssignee(workspaceId);
  const membership = user
    ? await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: user.id,
          },
        },
        select: { role: true },
      })
    : null;

  const canDelete =
    Boolean(user && task.creatorId === user.id) ||
    membership?.role === "ADMIN" ||
    user?.role === "ADMIN";

  const projectLabel = project ? `${project.key} — ${project.name}` : null;

  return (
    <IssueDetailsClient
      task={task}
      projectLabel={projectLabel}
      users={users}
      canDelete={Boolean(canDelete)}
    />
  );
};

export default IssueDetails;
