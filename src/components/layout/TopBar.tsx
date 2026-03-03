import TopBarClient from "./TopBarClient";
import { getProjects } from "@/server/queries/projects";
import { getUsersForAssignee } from "@/server/queries/users";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { isAuthentikConfigured } from "@/server/auth/authentik";

export default async function TopBar() {
  const workspaceId = await getCurrentWorkspaceId();
  const [projects, users] = await Promise.all([
    getProjects(workspaceId),
    getUsersForAssignee(workspaceId),
  ]);
  const mainAppBaseUrl = process.env.MAIN_APP_BASE_URL ?? null;
  const authSignInPath = isAuthentikConfigured() ? "/api/auth/signin/authentik" : null;
  return (
    <TopBarClient
      projects={projects}
      users={users}
      mainAppBaseUrl={authSignInPath ? null : mainAppBaseUrl}
      authSignInPath={authSignInPath}
    />
  );
}
