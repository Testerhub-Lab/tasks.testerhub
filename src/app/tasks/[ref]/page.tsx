import { notFound } from "next/navigation";
import IssueDetails from "../../../components/issues/IssueDetails";
import {
  getCommentsByTaskId,
  getTaskById,
  getTaskByKey,
  getTaskActivitiesByTaskId,
} from "../../../server/queries/tasks";
import { permanentRedirect } from "next/navigation";
import TaskComments from "../../../components/comments/TaskComments";
import { getCurrentWorkspaceId } from "../../../server/auth/workspace";
import { getCurrentUser } from "../../../server/auth/session";
import { getAccessibleProjectIds } from "../../../server/auth/access";
import {
  getProjectAccess,
  projectRoleAtLeast,
} from "../../../server/auth/access";
import { ProjectRole } from "@prisma/client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface TaskPageProps {
  params: Promise<{ ref: string }>;
}

const TaskPage = async ({ params }: TaskPageProps) => {
  const { ref } = await params;
  if (!ref) {
    return notFound();
  }

  const normalizedRef = ref.toUpperCase();
  const issueKeyPattern = /^[A-Z0-9]+-\d+$/;
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?redirect=${encodeURIComponent(`/tasks/${ref}`)}`);
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/signin");
  const accessibleProjectIds = await getAccessibleProjectIds(user, workspaceId, {
    includeArchived: true,
  });
  const task = issueKeyPattern.test(normalizedRef)
    ? await getTaskByKey(normalizedRef, accessibleProjectIds)
    : await getTaskById(ref, accessibleProjectIds);

  if (!task) {
    return notFound();
  }

  const taskKey = (task as { key?: string | null }).key;
  if (!issueKeyPattern.test(normalizedRef) && taskKey) {
    permanentRedirect(`/tasks/${taskKey}`);
  }

  const comments = await getCommentsByTaskId(task.id);
  const activities = await getTaskActivitiesByTaskId(task.id);
  const projectAccess = await getProjectAccess(user, task.projectId, {
    workspaceId,
    includeArchived: true,
  });
  const canComment = Boolean(
    projectAccess &&
      projectRoleAtLeast(projectAccess.role, ProjectRole.MEMBER)
  );

  return (
    <div className="space-y-6">
      <IssueDetails task={task} />
      <div id="activity" className="mx-auto max-w-6xl space-y-4 scroll-mt-24">
      <TaskComments
        boardId={task.projectId}
        taskId={task.id}
        issueKey={(task as { key?: string | null }).key ?? task.id}
        createdAt={task.createdAt}
        comments={comments}
        activities={activities}
        canComment={canComment}
      />
      </div>
    </div>
  );
};

export default TaskPage;
