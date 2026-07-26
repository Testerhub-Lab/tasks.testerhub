import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getDeletedTasks } from "@/server/queries/tasks";
import prisma from "@/lib/prisma";
import TrashClient from "@/components/trash/TrashClient";
import { getAccessibleProjectIds } from "@/server/auth/access";
import { redirect } from "next/navigation";

const TrashPage = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/trash");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/trash");
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId, {
    includeArchived: true,
  });

  const [tasks, membership, projectMemberships] = await Promise.all([
    getDeletedTasks(accessibleProjectIds),
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
      select: { role: true },
    }),
    prisma.projectMember.findMany({
      where: {
        userId: user.id,
        projectId: { in: accessibleProjectIds },
        role: "ADMIN",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { projectId: true },
    }),
  ]);

  const isAdmin = membership?.role === "ADMIN" || user?.role === "ADMIN";
  const managedProjectIds = new Set(projectMemberships.map((item) => item.projectId));

  const items = tasks.map((task) => ({
    id: task.id,
    key: task.key,
    title: task.title,
    projectName: task.project.name,
    status: task.status,
    deletedAt: task.deletedAt ?? null,
    canRestore:
      isAdmin ||
      managedProjectIds.has(task.projectId) ||
      task.creatorId === user.id,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <h1 className="text-lg font-semibold text-white">Корзина</h1>
      <TrashClient tasks={items} />
    </div>
  );
};

export default TrashPage;
