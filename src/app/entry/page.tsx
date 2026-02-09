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
  const inviteId = typeof params.invite === "string" ? params.invite : "";

  if (!wsSlug) {
    return redirect("/board");
  }

  const inviteOk = verifyWorkspaceInvite({
    wsSlug,
    projectId,
    exp,
    sig,
    inviteId: inviteId || null,
  });
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

  if (inviteId) {
    const invite = await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      select: { workspaceId: true, projectId: true, expiresAt: true, revokedAt: true },
    });

    if (!invite) {
      return redirect("/board");
    }

    if (invite.workspaceId !== workspace.id) {
      return redirect("/board");
    }

    if (invite.projectId && invite.projectId !== projectId) {
      return redirect("/board");
    }

    if (!invite.projectId && projectId) {
      return redirect("/board");
    }

    if (invite.revokedAt) {
      return redirect("/board");
    }

    const expMs = Number(exp);
    if (!Number.isFinite(expMs) || expMs <= 0 || expMs !== invite.expiresAt.getTime()) {
      return redirect("/board");
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      return redirect("/board");
    }
  }

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!project) {
      return redirect("/board");
    }
  }

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" },
    update: {},
  });

  await setCurrentWorkspaceId(workspace.id);

  if (projectId) {
    return redirect(`/board?create=1&createProjectId=${projectId}`);
  }

  return redirect("/board");
};

export default EntryPage;
