import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import prisma from "@/lib/prisma";
import WorkspaceSettingsClient from "@/components/workspace/WorkspaceSettingsClient";
import WorkspaceMembersClient from "@/components/workspace/WorkspaceMembersClient";
import WorkspaceProjectsClient from "@/components/workspace/WorkspaceProjectsClient";
import ProjectAccessClient from "@/components/workspace/ProjectAccessClient";
import { getWorkspaceRole } from "@/server/auth/access";
import { redirect } from "next/navigation";

const WorkspaceSettingsPage = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/settings/workspace");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/settings/workspace");

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

  const workspaceRole = await getWorkspaceRole(user, workspaceId);
  const canEditWorkspace = workspaceRole === "ADMIN";
  const accessCheckTime = new Date();
  const managedProjects = await prisma.project.findMany({
    where: {
      workspaceId,
      ...(canEditWorkspace
        ? {}
        : {
            members: {
              some: {
                userId: user.id,
                role: "ADMIN",
                OR: [{ expiresAt: null }, { expiresAt: { gt: accessCheckTime } }],
              },
            },
          }),
    },
    select: { id: true, key: true, name: true, archivedAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (!canEditWorkspace && managedProjects.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-card-border)] bg-[var(--color-card-bg)] p-6 text-sm text-[var(--color-text-secondary)]">
        Недостаточно прав для управления воркспейсом или проектами.
      </div>
    );
  }

  const [members, projectMembers] = await Promise.all([
    canEditWorkspace
      ? prisma.workspaceMember.findMany({
          where: { workspaceId },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.projectMember.findMany({
      where: { projectId: { in: managedProjects.map((project) => project.id) } },
      select: {
        id: true,
        projectId: true,
        role: true,
        expiresAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      {canEditWorkspace ? (
        <>
          <section id="workspace">
            <WorkspaceSettingsClient
              workspaceId={workspace.id}
              initialName={workspace.name}
              canEdit
            />
          </section>
          <section id="projects">
            <WorkspaceProjectsClient
              workspaceId={workspace.id}
              projects={managedProjects.map((project) => ({
                ...project,
                archivedAt: project.archivedAt
                  ? project.archivedAt.toISOString()
                  : null,
              }))}
            />
          </section>
        </>
      ) : null}
      <section id="project-access">
        <ProjectAccessClient
          workspaceId={workspace.id}
          currentUserId={user.id}
          projects={managedProjects.map((project) => ({
            id: project.id,
            key: project.key,
            name: project.name,
          }))}
          members={projectMembers.map((member) => ({
            ...member,
            expiresAt: member.expiresAt
              ? member.expiresAt.toISOString()
              : null,
            isExpired: member.expiresAt
              ? member.expiresAt <= accessCheckTime
              : false,
          }))}
        />
      </section>
      {canEditWorkspace ? (
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
      ) : null}
    </div>
  );
};

export default WorkspaceSettingsPage;
