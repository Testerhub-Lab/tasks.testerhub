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
  const workspaceId = await getCurrentWorkspaceId();
  const task = issueKeyPattern.test(normalizedRef)
    ? await getTaskByKey(normalizedRef, workspaceId)
    : await getTaskById(ref, workspaceId);

  if (!task) {
    return notFound();
  }

  const taskKey = (task as { key?: string | null }).key;
  if (!issueKeyPattern.test(normalizedRef) && taskKey) {
    permanentRedirect(`/tasks/${taskKey}`);
  }

  const comments = await getCommentsByTaskId(task.id);
  const activities = await getTaskActivitiesByTaskId(task.id);

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
      />
      </div>
    </div>
  );
};

export default TaskPage;
