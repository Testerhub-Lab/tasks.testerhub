import React from "react";
import { getProjects } from "../../../server/queries/projects";
import NewTaskForm from "./NewTaskForm";

const NewTaskPage = async () => {
  const projects = await getProjects();
  return <NewTaskForm projects={projects} />;
};

export default NewTaskPage;
