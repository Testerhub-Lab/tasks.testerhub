import React from "react";
import { notFound } from "next/navigation";
import IssueDetails from "../../../components/issues/IssueDetails";
import CommentList from "../../../components/comments/CommentList";
import AddCommentForm from "../../../components/comments/AddCommentForm";
import Card from "../../../components/ui/Card";
import {
  getCommentsByTaskId,
  getTaskById,
  getTaskByKey,
} from "../../../server/queries/tasks";
import { getProjectById } from "../../../server/queries/projects";
import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface TaskPageProps {
  params: { ref: string };
}

const TaskPage = async ({ params }: TaskPageProps) => {
  const { ref } = params;
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

  const taskProjectId = (task as { projectId?: string | null }).projectId;
  const project = taskProjectId ? await getProjectById(taskProjectId) : null;
  const comments = await getCommentsByTaskId(task.id);

  return (
    <div className="space-y-6">
      <IssueDetails task={task} />
      <div className="mx-auto max-w-6xl">
        <Card className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]">
          <div>
            <span className="text-white">Project:</span>{" "}
            {project ? `${project.key} — ${project.name}` : "—"}
          </div>
          <div>
            <span className="text-white">Created:</span>{" "}
            {task.createdAt.toISOString().slice(0, 10)}
          </div>
        </Card>
      </div>
      <div className="mx-auto max-w-6xl space-y-4">
        <h2 className="text-lg font-semibold">Comments</h2>
        <CommentList comments={comments} />
        <AddCommentForm taskId={task.id} />
      </div>
    </div>
  );
};

export default TaskPage;
