import TopBarClient from "./TopBarClient";
import { getProjects } from "@/server/queries/projects";
import { getUsersForAssignee } from "@/server/queries/users";

export default async function TopBar() {
  const [projects, users] = await Promise.all([getProjects(), getUsersForAssignee()]);
  return <TopBarClient projects={projects} users={users} />;
}
