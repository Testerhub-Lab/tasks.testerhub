import TopBarClient from "./TopBarClient";
import { getProjects } from "@/server/queries/projects";
import { getUsersForAssignee } from "@/server/queries/users";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getCurrentUser } from "@/server/auth/session";
import { getAccessibleProjectIds } from "@/server/auth/access";

export default async function TopBar() {
  const user = await getCurrentUser();
  if (!user) return null;
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return null;
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId);
  const [projects, users] = await Promise.all([
    getProjects(workspaceId, user),
    getUsersForAssignee(workspaceId, accessibleProjectIds),
  ]);
  return <TopBarClient projects={projects} users={users} />;
}
