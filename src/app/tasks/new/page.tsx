import React from "react";
import { getProjects } from "../../../server/queries/projects";
import { getCurrentWorkspaceId } from "../../../server/auth/workspace";
import NewTaskForm from "./NewTaskForm";

const NewTaskPage = async () => {
  const workspaceId = await getCurrentWorkspaceId();
  const projects = await getProjects(workspaceId);
  return <NewTaskForm projects={projects} />;
};

export default NewTaskPage;
