import TopBarClient from "./TopBarClient";
import { getProjects } from "@/server/queries/projects";
import { getUsersForAssignee } from "@/server/queries/users";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";

export default async function TopBar() {
  const workspaceId = await getCurrentWorkspaceId();
  const [projects, users] = await Promise.all([
    getProjects(workspaceId),
    getUsersForAssignee(workspaceId),
  ]);
  return <TopBarClient projects={projects} users={users} />;
}
