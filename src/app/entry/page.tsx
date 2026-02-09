import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { setCurrentWorkspaceId } from "@/server/auth/workspace";
import { verifyWorkspaceInvite } from "@/server/auth/invite";

interface EntryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const EntryPage = async ({ searchParams }: EntryPageProps) => {
  const params = await searchParams;
  const wsSlug = typeof params.ws === "string" ? params.ws : "";
  const projectId = typeof params.projectId === "string" ? params.projectId : "";
  const exp = typeof params.exp === "string" ? params.exp : "";
  const sig = typeof params.sig === "string" ? params.sig : "";

  if (!wsSlug || !projectId) {
    return redirect("/board");
  }

  const inviteOk = verifyWorkspaceInvite({ wsSlug, projectId, exp, sig });
  if (!inviteOk) {
    return redirect("/board");
  }

  const user = await getCurrentUser();
  if (!user) {
    return redirect("/board");
  }

  const workspace = await getWorkspaceBySlug(wsSlug);
  if (!workspace) {
    return redirect("/board");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!project) {
    return redirect("/board");
  }

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" },
    update: {},
  });

  await setCurrentWorkspaceId(workspace.id);

  return redirect(`/board?create=1&createProjectId=${projectId}`);
};

export default EntryPage;
