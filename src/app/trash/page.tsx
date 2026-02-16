import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getDeletedTasks } from "@/server/queries/tasks";
import prisma from "@/lib/prisma";
import TrashClient from "@/components/trash/TrashClient";

const TrashPage = async () => {
  const [workspaceId, user] = await Promise.all([
    getCurrentWorkspaceId(),
    getCurrentUser(),
  ]);

  const [tasks, membership] = await Promise.all([
    getDeletedTasks(workspaceId),
    user
      ? prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId: user.id,
            },
          },
          select: { role: true },
        })
      : null,
  ]);

  const isAdmin = membership?.role === "ADMIN" || user?.role === "ADMIN";

  const items = tasks.map((task) => ({
    id: task.id,
    key: task.key,
    title: task.title,
    projectName: task.project.name,
    status: task.status,
    deletedAt: task.deletedAt ?? null,
    canRestore: isAdmin || Boolean(user && task.creatorId === user.id),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <h1 className="text-lg font-semibold text-white">Корзина</h1>
      <TrashClient tasks={items} />
    </div>
  );
};

export default TrashPage;
