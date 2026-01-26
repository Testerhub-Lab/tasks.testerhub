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

export const dynamic = "force-dynamic";

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

const TaskPage = async ({ params }: TaskPageProps) => {
  const { id } = await params;
  if (!id) {
    return notFound();
  }

  const issueKeyPattern = /^[A-Za-z][A-Za-z0-9]*-\d+$/;
  const task = issueKeyPattern.test(id)
    ? await getTaskByKey(id.toUpperCase())
    : await getTaskById(id);

  if (!task) {
    return notFound();
  }

  const project = task.projectId
    ? await getProjectById(task.projectId)
    : null;
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
