import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { getZeroDatabase, getZeroPool } from "@/zero/db";
import { zeroMutators } from "@/zero/mutators";
import { zeroQueries } from "@/zero/queries";
import { issueKey, rankAfter } from "@/zero/stage3";
import type { WorkflowCategory, WorkspaceRole } from "@/zero/schema";
import type { ApiActor } from "./auth";
import { ApiError } from "./errors";
import { findIssueCandidateIDs } from "./issue-search";
import type {
  addCommentApiSchema,
  createIssueApiSchema,
  createProjectApiSchema,
  issueStatusSchema,
  updateIssueApiSchema,
} from "./schemas";

type CreateProjectInput = z.infer<typeof createProjectApiSchema>;
type CreateIssueInput = z.infer<typeof createIssueApiSchema>;
type UpdateIssueInput = z.infer<typeof updateIssueApiSchema>;
type AddCommentInput = z.infer<typeof addCommentApiSchema>;
type ApiIssueStatus = z.infer<typeof issueStatusSchema>;

const statusCategory: Record<ApiIssueStatus, WorkflowCategory> = {
  NEW: "BACKLOG",
  TODO: "UNSTARTED",
  HOLD: "STARTED",
  IN_PROGRESS: "STARTED",
  TESTING: "STARTED",
  DONE: "COMPLETED",
  REJECT: "CANCELED",
};

function apiRole(role: WorkspaceRole) {
  return role === "OWNER" ? "ADMIN" : role;
}

function apiStatus(state: { name: string; category: WorkflowCategory }) {
  const byName: Record<string, ApiIssueStatus> = {
    backlog: "NEW",
    new: "NEW",
    todo: "TODO",
    hold: "HOLD",
    "in progress": "IN_PROGRESS",
    testing: "TESTING",
    done: "DONE",
    rejected: "REJECT",
    canceled: "REJECT",
    cancelled: "REJECT",
  };
  return (
    byName[state.name.trim().toLowerCase()] ??
    ({
      BACKLOG: "NEW",
      UNSTARTED: "TODO",
      STARTED: "IN_PROGRESS",
      COMPLETED: "DONE",
      CANCELED: "REJECT",
    } satisfies Record<WorkflowCategory, ApiIssueStatus>)[state.category]
  );
}

function publicUser(
  user: { id: string; displayName?: string | null } | undefined
) {
  return user
    ? {
        id: user.id,
        name: user.displayName ?? null,
        email: null,
      }
    : null;
}

function iso(value: number) {
  return new Date(value).toISOString();
}

function asApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error && /access denied|administration denied/i.test(error.message)) {
    throw new ApiError(403, "forbidden", error.message);
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new ApiError(409, "conflict", "Ресурс с таким ключом уже существует");
  }
  throw error;
}

async function workspaceRows(userID: string) {
  return getZeroDatabase().run(
    zeroQueries.workspaces.mine.fn({ ctx: { userID } })
  );
}

async function workspaceRole(userID: string, workspaceID: string) {
  const members = await getZeroDatabase().run(
    zeroQueries.members.byWorkspace.fn({
      args: { workspaceID },
      ctx: { userID },
    })
  );
  return members.find((member) => member.userID === userID)?.role ?? null;
}

async function projectRows(userID: string, workspaceID?: string | null) {
  const workspaces = await workspaceRows(userID);
  const selected = workspaceID
    ? workspaces.filter((workspace) => workspace.id === workspaceID)
    : workspaces;
  const groups = await Promise.all(
    selected.map(async (workspace) => ({
      workspace,
      role: await workspaceRole(userID, workspace.id),
      projects: await getZeroDatabase().run(
        zeroQueries.projects.byWorkspace.fn({
          args: { workspaceID: workspace.id },
          ctx: { userID },
        })
      ),
    }))
  );
  return groups.flatMap(({ workspace, role, projects }) =>
    projects.map((project) => ({ project, role, workspace }))
  );
}

export async function requireApiProjectByKey(
  userID: string,
  projectKey: string
) {
  const normalized = projectKey.trim().toUpperCase();
  const match = (await projectRows(userID)).find(
    ({ project }) => project.key === normalized
  );
  if (!match) {
    throw new ApiError(404, "project_not_found", "Проект не найден");
  }
  return match;
}

export async function requireApiIssueByKey(userID: string, key: string) {
  const match = /^([A-Z][A-Z0-9]{1,9})-(\d+)$/.exec(
    key.trim().toUpperCase()
  );
  if (!match) {
    throw new ApiError(404, "issue_not_found", "Задача не найдена");
  }

  const project = await requireApiProjectByKey(userID, match[1]);
  const issues = await getZeroDatabase().run(
    zeroQueries.issues.byProject.fn({
      args: { projectID: project.project.id },
      ctx: { userID },
    })
  );
  const issue = issues.find((row) => row.number === Number(match[2]));
  if (!issue) {
    throw new ApiError(404, "issue_not_found", "Задача не найдена");
  }
  return { issue, ...project };
}

function serializeIssue(
  row: Pick<
    Awaited<ReturnType<typeof requireApiIssueByKey>>,
    "issue" | "project"
  >
) {
  const { issue, project } = row;
  if (!issue.state) {
    throw new ApiError(409, "workflow_state_missing", "Задача не содержит state");
  }
  const assignee = issue.participants.find(
    (participant) => participant.role === "ASSIGNEE"
  );
  return {
    id: issue.id,
    key: issueKey(project.key, issue.number),
    number: issue.number,
    title: issue.title,
    description: issue.description ?? null,
    type: issue.type,
    priority: issue.priority,
    status: apiStatus(issue.state),
    tags: issue.tags.map((tag) => tag.name),
    createdAt: iso(issue.createdAt),
    updatedAt: iso(issue.updatedAt),
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
    },
    assignee: publicUser(assignee?.user),
    reporter: publicUser(issue.reporter),
  };
}

async function workflowStates(userID: string, workflowID: string) {
  return getZeroDatabase().run(
    zeroQueries.workflowStates.byWorkflow.fn({
      args: { workflowID },
      ctx: { userID },
    })
  );
}

function stateForStatus(
  states: Awaited<ReturnType<typeof workflowStates>>,
  status: ApiIssueStatus
) {
  const named = states.find(
    (state) =>
      state.name.trim().toLowerCase() ===
      {
        NEW: "backlog",
        TODO: "todo",
        HOLD: "hold",
        IN_PROGRESS: "in progress",
        TESTING: "testing",
        DONE: "done",
        REJECT: "rejected",
      }[status]
  );
  const state =
    named ?? states.find((candidate) => candidate.category === statusCategory[status]);
  if (!state) {
    throw new ApiError(
      409,
      "workflow_state_missing",
      `Workflow не содержит state для статуса ${status}`
    );
  }
  return state;
}

export async function listApiWorkspaces(user: ApiActor) {
  const rows = await workspaceRows(user.id);
  const projects = await projectRows(user.id);
  return Promise.all(
    rows.map(async (workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: iso(workspace.createdAt),
      role: await workspaceRole(user.id, workspace.id),
      projectCount: projects.filter(
        ({ project }) => project.workspaceID === workspace.id
      ).length,
    }))
  );
}

export async function listApiProjects(
  user: ApiActor,
  workspaceID?: string | null
) {
  return (await projectRows(user.id, workspaceID)).map(
    ({ project, role, workspace }) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      role: role ? apiRole(role) : "VIEWER",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      knowledge: {
        provider: project.knowledgeProvider,
        externalUrl: project.knowledgeExternalURL ?? null,
      },
    })
  );
}

export async function searchApiIssues(
  user: ApiActor,
  input: {
    projectKey?: string | null;
    query: string;
    statuses: ApiIssueStatus[];
    limit: number;
  }
) {
  const project = input.projectKey
    ? await requireApiProjectByKey(user.id, input.projectKey)
    : null;
  const candidateIDs = await findIssueCandidateIDs(getZeroPool(), {
    userID: user.id,
    query: input.query,
    projectKey: project?.project.key,
    statuses: input.statuses,
    limit: input.limit,
  });
  if (candidateIDs.length === 0) return [];

  const issues = await getZeroDatabase().run(
    zeroQueries.issues.byIDs.fn({
      args: { issueIDs: candidateIDs },
      ctx: { userID: user.id },
    })
  );
  const issueByID = new Map(issues.map((issue) => [issue.id, issue]));
  return candidateIDs.flatMap((issueID) => {
    const issue = issueByID.get(issueID);
    return issue?.project
      ? [serializeIssue({ issue, project: issue.project })]
      : [];
  });
}

export async function getApiIssue(user: ApiActor, key: string) {
  const row = await requireApiIssueByKey(user.id, key);
  const [comments, knowledgeLinks] = await Promise.all([
    getZeroDatabase().run(
      zeroQueries.comments.byIssue.fn({
        args: { issueID: row.issue.id },
        ctx: { userID: user.id },
      })
    ),
    getZeroDatabase().run(
      zeroQueries.issueWikiLinks.byIssue.fn({
        args: { issueID: row.issue.id },
        ctx: { userID: user.id },
      })
    ),
  ]);
  return {
    ...serializeIssue(row),
    creator: publicUser(row.issue.creator),
    comments: comments.map((comment) => ({
      id: comment.id,
      text: comment.body,
      userId: comment.authorID,
      authorName: null,
      createdAt: iso(comment.createdAt),
      user: publicUser(comment.author),
    })),
    activities: [],
    knowledgeLinks: knowledgeLinks.flatMap((link) =>
      link.page && !link.page.archivedAt
        ? [
            {
              id: link.id,
              provider: "NATIVE" as const,
              documentKey: link.page.id,
              title: link.page.title,
              url: null,
              createdAt: iso(link.createdAt),
            },
          ]
        : []
    ),
  };
}

export async function createApiProject(
  user: ApiActor,
  input: CreateProjectInput
) {
  const workflows = await getZeroDatabase().run(
    zeroQueries.workflows.byWorkspace.fn({
      args: { workspaceID: input.workspaceId },
      ctx: { userID: user.id },
    })
  );
  const workflow =
    workflows.find((candidate) => candidate.isDefault) ?? workflows[0];
  if (!workflow) {
    throw new ApiError(409, "workflow_missing", "Workspace не содержит workflow");
  }

  const id = randomUUID();
  try {
    await getZeroDatabase().transaction((tx) =>
      zeroMutators.projects.create.fn({
        args: {
          id,
          workspaceID: input.workspaceId,
          workflowID: workflow.id,
          key: input.key,
          name: input.name,
          description: input.description,
        },
        ctx: { userID: user.id },
        tx,
      })
    );
  } catch (error) {
    asApiError(error);
  }

  const created = (await listApiProjects(user, input.workspaceId)).find(
    (project) => project.id === id
  );
  if (!created) {
    throw new ApiError(
      500,
      "project_not_found_after_create",
      "Созданный проект не найден"
    );
  }
  return created;
}

export async function createApiIssue(
  user: ApiActor,
  input: CreateIssueInput
) {
  const project = await requireApiProjectByKey(user.id, input.projectKey);
  const states = await workflowStates(user.id, project.project.workflowID);
  const state = stateForStatus(states, "NEW");
  const issues = await getZeroDatabase().run(
    zeroQueries.issues.byProject.fn({
      args: { projectID: project.project.id },
      ctx: { userID: user.id },
    })
  );
  const stateIssues = issues.filter((issue) => issue.stateID === state.id);
  const id = randomUUID();

  try {
    await getZeroDatabase().transaction(async (tx) => {
      await zeroMutators.issues.create.fn({
        args: {
          id,
          projectID: project.project.id,
          stateID: state.id,
          title: input.title,
          description: input.description,
          type: input.type,
          priority: input.priority,
          rank: rankAfter(stateIssues.map((issue) => issue.rank)),
        },
        ctx: { userID: user.id },
        tx,
      });
      await zeroMutators.issues.setTags.fn({
        args: {
          id,
          tags: input.tags.map((name) => ({ id: randomUUID(), name })),
        },
        ctx: { userID: user.id },
        tx,
      });
    });
  } catch (error) {
    asApiError(error);
  }

  const created = await getZeroDatabase().run(
    zeroQueries.issues.byID.fn({
      args: { issueID: id },
      ctx: { userID: user.id },
    })
  );
  if (!created) {
    throw new ApiError(
      500,
      "issue_not_found_after_create",
      "Созданная задача не найдена"
    );
  }
  return getApiIssue(user, issueKey(project.project.key, created.number));
}

export async function updateApiIssue(
  user: ApiActor,
  key: string,
  input: UpdateIssueInput
) {
  const row = await requireApiIssueByKey(user.id, key);
  const states = input.status
    ? await workflowStates(user.id, row.project.workflowID)
    : [];
  try {
    await getZeroDatabase().transaction(async (tx) => {
      const fields = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.status !== undefined
          ? { stateID: stateForStatus(states, input.status).id }
          : {}),
      };
      if (Object.keys(fields).length > 0) {
        await zeroMutators.issues.update.fn({
          args: { id: row.issue.id, ...fields },
          ctx: { userID: user.id },
          tx,
        });
      }
      if (input.tags !== undefined) {
        await zeroMutators.issues.setTags.fn({
          args: {
            id: row.issue.id,
            tags: input.tags.map((name) => ({
              id: randomUUID(),
              name,
            })),
          },
          ctx: { userID: user.id },
          tx,
        });
      }
    });
  } catch (error) {
    asApiError(error);
  }
  return getApiIssue(user, key);
}

export async function addApiComment(
  user: ApiActor,
  key: string,
  input: AddCommentInput
) {
  const row = await requireApiIssueByKey(user.id, key);
  const id = randomUUID();
  try {
    await getZeroDatabase().transaction((tx) =>
      zeroMutators.comments.create.fn({
        args: { id, issueID: row.issue.id, body: input.text },
        ctx: { userID: user.id },
        tx,
      })
    );
  } catch (error) {
    asApiError(error);
  }

  return {
    id,
    taskId: row.issue.id,
    text: input.text,
    userId: user.id,
    authorName: null,
    createdAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  };
}
