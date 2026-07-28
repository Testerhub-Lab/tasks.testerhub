import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { setCurrentWorkspaceId } from "@/server/auth/workspace";
import { verifyWorkspaceInvite } from "@/server/auth/invite";
import { mergeProjectMembership } from "@/server/auth/accessPolicy";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";

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

  if (!wsSlug || !projectId || !exp || !sig || !inviteId) redirect("/board");

  const inviteOk = verifyWorkspaceInvite({
    wsSlug,
    projectId,
    exp,
    sig,
    inviteId,
  });
  if (!inviteOk) redirect("/board");

  const user = await getCurrentUser();
  if (!user) {
    const returnParams = new URLSearchParams({
      ws: wsSlug,
      projectId,
      exp,
      sig,
      invite: inviteId,
    });
    return redirect(
      `/signin?redirect=${encodeURIComponent(`/entry?${returnParams.toString()}`)}`
    );
  }
  if (usesZeroUiStore()) redirect("/board");

  const workspace = await getWorkspaceBySlug(wsSlug);
  if (!workspace) redirect("/board");

  const invite = await prisma.workspaceInvite.findUnique({
    where: { id: inviteId },
    select: {
      workspaceId: true,
      projectId: true,
      projectRole: true,
      accessDurationDays: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  if (
    !invite ||
    invite.workspaceId !== workspace.id ||
    invite.projectId !== projectId ||
    invite.revokedAt
  ) {
    redirect("/board");
  }

  const expMs = Number(exp);
  if (
    !Number.isFinite(expMs) ||
    expMs <= 0 ||
    expMs !== invite.expiresAt.getTime() ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    redirect("/board");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: workspace.id, archivedAt: null },
    select: { id: true },
  });
  if (!project) redirect("/board");

  const existing = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: user.id,
      },
    },
    select: { role: true, expiresAt: true },
  });
  const redeemedAt = new Date();
  const activeExisting =
    existing &&
    (existing.expiresAt === null || existing.expiresAt > redeemedAt)
      ? existing
      : null;
  const inviteAccessExpiresAt = invite.accessDurationDays
    ? new Date(
        redeemedAt.getTime() +
          invite.accessDurationDays * 24 * 60 * 60 * 1000
      )
    : null;
  const mergedMembership = mergeProjectMembership(activeExisting, {
    role: invite.projectRole,
    expiresAt: inviteAccessExpiresAt,
  });

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
      create: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" },
      update: {},
    }),
    prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: user.id,
        },
      },
      create: {
        projectId,
          userId: user.id,
          role: invite.projectRole,
          expiresAt: inviteAccessExpiresAt,
      },
        update: {
          role: mergedMembership.role,
          expiresAt: mergedMembership.expiresAt,
        },
    }),
  ]);

  await setCurrentWorkspaceId(workspace.id);

  return redirect(`/board?projectId=${projectId}`);
};

export default EntryPage;
