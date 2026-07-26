import React from "react";
import { getProjects } from "../../../server/queries/projects";
import { getCurrentWorkspaceId } from "../../../server/auth/workspace";
import { getCurrentUser } from "../../../server/auth/session";
import NewTaskForm from "./NewTaskForm";
import { redirect } from "next/navigation";

const NewTaskPage = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/tasks/new");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/tasks/new");
  const projects = (await getProjects(workspaceId, user)).filter(
    (project) => project.canWrite
  );
  return <NewTaskForm projects={projects} />;
};

export default NewTaskPage;
