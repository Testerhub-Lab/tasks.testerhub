import React from "react";
import type { Task } from "@prisma/client";
import { getProjectById } from "../../server/queries/projects";
import IssueDetailsClient from "./IssueDetailsClient";

interface IssueDetailsProps {
  task: Task;
}

const IssueDetails = async ({ task }: IssueDetailsProps) => {
  const project =
    (task as { projectId?: string | null }).projectId
      ? await getProjectById((task as { projectId?: string | null }).projectId!)
      : null;

  const projectLabel = project ? `${project.key} — ${project.name}` : null;

  return <IssueDetailsClient task={task} projectLabel={projectLabel} />;
};

export default IssueDetails;
