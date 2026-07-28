import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getDeletedTasks } from "@/server/queries/tasks";
import TrashClient from "@/components/trash/TrashClient";
import {
  getAccessibleProjectIds,
  getProjectAccess,
  getWorkspaceRole,
} from "@/server/auth/access";
import { redirect } from "next/navigation";

const TrashPage = async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?redirect=/trash");
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin?redirect=/trash");
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId, {
    includeArchived: true,
  });

  const [tasks, workspaceRole, projectAccesses] = await Promise.all([
    getDeletedTasks(accessibleProjectIds),
    getWorkspaceRole(user, workspaceId),
    Promise.all(
      accessibleProjectIds.map((projectId) =>
        getProjectAccess(user, projectId, {
          workspaceId,
          includeArchived: true,
        })
      )
    ),
  ]);

  const isAdmin = workspaceRole === "ADMIN" || user?.role === "ADMIN";
  const managedProjectIds = new Set(
    projectAccesses
      .filter((access) => access?.role === "ADMIN")
      .map((access) => access!.projectId)
  );

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
