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
import { buildIssueDetailHref } from "../../../shared/issueNavigation";

export const dynamic = "force-dynamic";

interface TaskPageProps {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function renderTaskPage({
  params,
  searchParams,
  projectContext = null,
}: TaskPageProps & {
  projectContext?: { id: string; key: string } | null;
}) {
  const { ref } = await params;
  const resolvedSearchParams = await searchParams;
  if (!ref) {
    return notFound();
  }

  const normalizedRef = ref.toUpperCase();
  const issueKeyPattern = /^[A-Z0-9]+-\d+$/;
  const user = await getCurrentUser();
  const currentTaskHref = buildIssueDetailHref(ref, resolvedSearchParams, {
    projectKey: projectContext?.key,
  });
  if (!user) {
    redirect(`/signin?redirect=${encodeURIComponent(currentTaskHref)}`);
  }
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
  if (
    projectContext &&
    task.project.key.toUpperCase() !== projectContext.key.toUpperCase()
  ) {
    return notFound();
  }

  const taskKey = (task as { key?: string | null }).key;
  if (!projectContext && taskKey) {
    permanentRedirect(
      buildIssueDetailHref(taskKey, resolvedSearchParams, {
        projectKey: task.project.key,
      })
    );
  }

  if (!issueKeyPattern.test(normalizedRef) && taskKey) {
    permanentRedirect(
      buildIssueDetailHref(taskKey, resolvedSearchParams, {
        projectId: task.projectId,
        projectKey: projectContext?.key ?? task.project.key,
      })
    );
  }

  const [comments, activities, projectAccess] = await Promise.all([
    getCommentsByTaskId(task.id),
    getTaskActivitiesByTaskId(task.id),
    getProjectAccess(user, task.projectId, {
      workspaceId,
      includeArchived: true,
    }),
  ]);
  const canComment = Boolean(
    projectAccess &&
      projectRoleAtLeast(projectAccess.role, ProjectRole.MEMBER)
  );

  return (
    <div className="space-y-8">
      <IssueDetails task={task} />
      <div id="activity" className="mx-auto max-w-6xl scroll-mt-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
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
    </div>
  );
}

const TaskPage = ({ params, searchParams }: TaskPageProps) =>
  renderTaskPage({ params, searchParams });

export default TaskPage;
