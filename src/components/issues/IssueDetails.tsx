import React from "react";
import { getProjectById } from "../../server/queries/projects";
import { getUsersForAssignee } from "../../server/queries/users";
import type { TaskWithProjectAndReporter } from "../../server/queries/tasks";
import IssueDetailsClient from "./IssueDetailsClient";

interface IssueDetailsProps {
  task: TaskWithProjectAndReporter;
}

const IssueDetails = async ({ task }: IssueDetailsProps) => {
  const project =
    (task as { projectId?: string | null }).projectId
      ? await getProjectById((task as { projectId?: string | null }).projectId!)
      : null;
  const users = await getUsersForAssignee();

  const projectLabel = project ? `${project.key} — ${project.name}` : null;

  return (
    <IssueDetailsClient task={task} projectLabel={projectLabel} users={users} />
  );
};

export default IssueDetails;
