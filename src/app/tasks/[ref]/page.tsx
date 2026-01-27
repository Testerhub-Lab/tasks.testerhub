import { notFound } from "next/navigation";
import IssueDetails from "../../../components/issues/IssueDetails";
import {
  getCommentsByTaskId,
  getTaskById,
  getTaskByKey,
} from "../../../server/queries/tasks";
import { permanentRedirect } from "next/navigation";
import TaskComments from "../../../components/comments/TaskComments";

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
  const task = issueKeyPattern.test(normalizedRef)
    ? await getTaskByKey(normalizedRef)
    : await getTaskById(ref);

  if (!task) {
    return notFound();
  }

  const taskKey = (task as { key?: string | null }).key;
  if (!issueKeyPattern.test(normalizedRef) && taskKey) {
    permanentRedirect(`/tasks/${taskKey}`);
  }

  const comments = await getCommentsByTaskId(task.id);

  return (
    <div className="space-y-6">
      <IssueDetails task={task} />
      <div className="mx-auto max-w-6xl space-y-4">
        <h2 className="text-lg font-semibold">Comments</h2>
        <TaskComments taskId={task.id} comments={comments} />
      </div>
    </div>
  );
};

export default TaskPage;
