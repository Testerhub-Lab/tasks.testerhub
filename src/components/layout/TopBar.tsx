import React from "react";
import TopBarClient from "./TopBarClient";
import { getProjects } from "../../server/queries/projects";

const TopBar = async () => {
  const projects = await getProjects();

  return <TopBarClient projects={projects} />;
};

export default TopBar;
