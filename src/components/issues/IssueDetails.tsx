import React from "react";
import { getProjectById } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import { getCurrentWorkspaceId } from "../../server/auth/workspace";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import IssueDetailsClient from "./IssueDetailsClient";

interface IssueDetailsProps {
  task: TaskWithProjectAndReporter;
}

const IssueDetails = async ({ task }: IssueDetailsProps) => {
  const workspaceId = await getCurrentWorkspaceId();
  const project =
    (task as { projectId?: string | null }).projectId
      ? await getProjectById(
          (task as { projectId?: string | null }).projectId!,
          workspaceId,
          { includeArchived: true }
        )
      : null;
  const users = await getUsersForAssignee(workspaceId);

  const projectLabel = project ? `${project.key} — ${project.name}` : null;

  return (
    <IssueDetailsClient task={task} projectLabel={projectLabel} users={users} />
  );
};

export default IssueDetails;
