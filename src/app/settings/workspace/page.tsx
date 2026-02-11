import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import prisma from "@/lib/prisma";
import WorkspaceSettingsClient from "@/components/workspace/WorkspaceSettingsClient";
import WorkspaceMembersClient from "@/components/workspace/WorkspaceMembersClient";
import WorkspaceProjectsClient from "@/components/workspace/WorkspaceProjectsClient";

const WorkspaceSettingsPage = async () => {
  const user = await getCurrentUser();
  const workspaceId = await getCurrentWorkspaceId();

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
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

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true, key: true, name: true, allowGuest: true, archivedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-5">
      <section id="workspace">
        <WorkspaceSettingsClient
          workspaceId={workspace.id}
          initialName={workspace.name}
          canEdit={canEdit}
        />
      </section>
      <section id="projects">
        <WorkspaceProjectsClient
          workspaceId={workspace.id}
          projects={projects.map((project) => ({
            ...project,
            archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
          }))}
        />
      </section>
      <section id="members">
        <WorkspaceMembersClient
          workspaceId={workspace.id}
          currentUserId={user.id}
          members={members.map((member) => ({
            ...member,
            createdAt: member.createdAt.toISOString(),
          }))}
        />
      </section>
    </div>
  );
};

export default WorkspaceSettingsPage;
