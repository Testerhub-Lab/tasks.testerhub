import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import prisma from "@/lib/prisma";
import WorkspaceSettingsClient from "@/components/workspace/WorkspaceSettingsClient";
import WorkspaceMembersClient from "@/components/workspace/WorkspaceMembersClient";
import WorkspaceInvitesClient from "@/components/workspace/WorkspaceInvitesClient";
import WorkspaceProjectsClient from "@/components/workspace/WorkspaceProjectsClient";
import { buildWorkspaceInviteLink } from "@/server/auth/invite";

const WorkspaceSettingsPage = async () => {
  const user = await getCurrentUser();
  const workspaceId = await getCurrentWorkspaceId();

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true, slug: true },
  });

  if (!workspace) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-6 text-sm text-[var(--color-text-secondary)]">
        Workspace not found.
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-6 text-sm text-[var(--color-text-secondary)]">
        Требуется авторизация, чтобы управлять воркспейсом.
      </div>
    );
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    select: { role: true },
  });

  const canEdit = membership?.role === "ADMIN";

  if (!canEdit) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-6 text-sm text-[var(--color-text-secondary)]">
        Недостаточно прав для управления настройками воркспейса.
      </div>
    );
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const invites = await prisma.workspaceInvite.findMany({
    where: { workspaceId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      project: { select: { key: true, name: true } },
      projectId: true,
    },
  });

  const baseUrl = process.env.MAIN_APP_BASE_URL ?? "";

  const inviteRows = invites.map((invite) => {
    const link =
      baseUrl && workspace.slug
        ? buildWorkspaceInviteLink({
            baseUrl,
            wsSlug: workspace.slug,
            projectId: invite.projectId ?? "",
            exp: invite.expiresAt.getTime(),
            inviteId: invite.id,
          })
        : null;

    return {
      id: invite.id,
      projectLabel: invite.project
        ? `${invite.project.key} — ${invite.project.name}`
        : "All projects",
      createdAt: invite.createdAt.toISOString().slice(0, 10),
      expiresAt: invite.expiresAt.toISOString().slice(0, 10),
      link: link ?? "Set MAIN_APP_BASE_URL",
    };
  });

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true, key: true, name: true, allowGuest: true, archivedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-5">
      <WorkspaceSettingsClient
        workspaceId={workspace.id}
        initialName={workspace.name}
        canEdit={canEdit}
      />
      <WorkspaceInvitesClient workspaceId={workspace.id} invites={inviteRows} />
      <WorkspaceProjectsClient
        workspaceId={workspace.id}
        projects={projects.map((project) => ({
          ...project,
          archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
        }))}
      />
      <WorkspaceMembersClient
        workspaceId={workspace.id}
        currentUserId={user.id}
        members={members.map((member) => ({
          ...member,
          createdAt: member.createdAt.toISOString(),
        }))}
      />
    </div>
  );
};

export default WorkspaceSettingsPage;
