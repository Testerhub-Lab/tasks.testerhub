import SidebarClient from "./SidebarClient";
import { getProjects } from "@/server/queries/projects";

export default async function Sidebar() {
  const projects = await getProjects();
  return <SidebarClient projects={projects} />;
}
