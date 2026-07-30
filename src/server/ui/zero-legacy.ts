import {
  KnowledgeProvider,
  Priority,
  ProjectRole,
  Status,
  type WorkspaceRole,
} from "@prisma/client";
import {
  BOARD_COLUMN_STATUSES,
  type BoardColumnLimits,
  type IssueFilters,
  type IssuePaginationInput,
} from "../validators/issueFilters";
import { usesZeroAuthStore } from "../auth/zero-store";
import { getZeroPool } from "../../zero/db";

type ZeroWorkspaceMemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type ZeroWorkflowCategory =
  | "BACKLOG"
  | "UNSTARTED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELED";

type ZeroTaskRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  project_key: string;
  project_name: string;
  project_workflow_id: string;
  project_next_issue_number: number;
  project_created_at: Date;
  project_archived_at: Date | null;
  number: number;
  title: string;
  description: string | null;
  type: string;
  priority: Priority;
  state_name: string;
  state_category: ZeroWorkflowCategory;
  creator_id: string;
  creator_name: string | null;
  creator_email: string | null;
  reporter_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  tags: string[];
  attachment_items: Array<{ id: string; fileName: string }>;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

export function usesZeroUiStore() {
  return usesZeroAuthStore();
}

function legacyWorkspaceRole(
  role: ZeroWorkspaceMemberRole
): WorkspaceRole {
  return role === "OWNER" || role === "ADMIN" ? "ADMIN" : "MEMBER";
}

function legacyProjectRole(role: ZeroWorkspaceMemberRole): ProjectRole {
  if (role === "OWNER" || role === "ADMIN") return ProjectRole.ADMIN;
  if (role === "MEMBER") return ProjectRole.MEMBER;
  return ProjectRole.VIEWER;
}

export function zeroStateToLegacyStatus(input: {
  name: string;
  category: ZeroWorkflowCategory;
}): Status {
  const named: Record<string, Status> = {
    backlog: Status.NEW,
    new: Status.NEW,
    todo: Status.TODO,
    hold: Status.HOLD,
    "in progress": Status.IN_PROGRESS,
    testing: Status.TESTING,
    done: Status.DONE,
    rejected: Status.REJECT,
    canceled: Status.REJECT,
    cancelled: Status.REJECT,
  };
  return (
    named[input.name.trim().toLowerCase()] ??
    {
      BACKLOG: Status.NEW,
      UNSTARTED: Status.TODO,
      STARTED: Status.IN_PROGRESS,
      COMPLETED: Status.DONE,
      CANCELED: Status.REJECT,
    }[input.category]
  );
}

export async function getZeroWorkspaceRole(
  userID: string,
  workspaceID: string
): Promise<WorkspaceRole | null> {
  const result = await getZeroPool().query<{
    role: ZeroWorkspaceMemberRole;
  }>(
    `SELECT membership.role
     FROM workspace_members AS membership
     JOIN workspaces AS workspace ON workspace.id = membership.workspace_id
     WHERE
       membership.user_id = $1
       AND membership.workspace_id = $2
       AND workspace.archived_at IS NULL`,
    [userID, workspaceID]
  );
  const role = result.rows[0]?.role;
  return role ? legacyWorkspaceRole(role) : null;
}

export async function getZeroAccessibleProjectIDs(
  userID: string,
  workspaceID: string,
  options?: { includeArchived?: boolean }
) {
  const result = await getZeroPool().query<{ id: string }>(
    `SELECT project.id
     FROM projects AS project
     JOIN workspace_members AS membership
       ON membership.workspace_id = project.workspace_id
      AND membership.user_id = $1
     JOIN workspaces AS workspace ON workspace.id = project.workspace_id
     WHERE
       project.workspace_id = $2
       AND workspace.archived_at IS NULL
       AND ($3::boolean OR project.archived_at IS NULL)
     ORDER BY project.created_at, project.id`,
    [userID, workspaceID, options?.includeArchived ?? false]
  );
  return result.rows.map((row) => row.id);
}

export async function getZeroProjectAccess(
  userID: string,
  projectID: string,
  options?: { workspaceId?: string; includeArchived?: boolean }
) {
  const result = await getZeroPool().query<{
    project_id: string;
    workspace_id: string;
    role: ZeroWorkspaceMemberRole;
  }>(
    `SELECT
       project.id AS project_id,
       project.workspace_id,
       membership.role
     FROM projects AS project
     JOIN workspace_members AS membership
       ON membership.workspace_id = project.workspace_id
      AND membership.user_id = $1
     JOIN workspaces AS workspace ON workspace.id = project.workspace_id
     WHERE
       project.id = $2
       AND ($3::uuid IS NULL OR project.workspace_id = $3)
       AND ($4::boolean OR project.archived_at IS NULL)
       AND workspace.archived_at IS NULL`,
    [
      userID,
      projectID,
      options?.workspaceId ?? null,
      options?.includeArchived ?? false,
    ]
  );
  const row = result.rows[0];
  if (!row) return null;
  const role = legacyProjectRole(row.role);
  return {
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    role,
    isWorkspaceAdmin: role === ProjectRole.ADMIN,
  };
}

export async function canAssignZeroUserToProject(
  userID: string,
  projectID: string
) {
  const result = await getZeroPool().query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM projects AS project
       JOIN workspace_members AS membership
         ON membership.workspace_id = project.workspace_id
       WHERE project.id = $2 AND membership.user_id = $1
     ) AS present`,
    [userID, projectID]
  );
  return result.rows[0]?.present ?? false;
}

export async function getZeroProjects(
  workspaceID: string,
  userID: string,
  options?: { includeArchived?: boolean }
) {
  const result = await getZeroPool().query<{
    id: string;
    name: string;
    key: string;
    archived_at: Date | null;
    role: ZeroWorkspaceMemberRole;
  }>(
    `SELECT
       project.id,
       project.name,
       project.key,
       project.archived_at,
       membership.role
     FROM projects AS project
     JOIN workspace_members AS membership
       ON membership.workspace_id = project.workspace_id
      AND membership.user_id = $2
     WHERE
       project.workspace_id = $1
       AND ($3::boolean OR project.archived_at IS NULL)
     ORDER BY project.created_at, project.id`,
    [workspaceID, userID, options?.includeArchived ?? false]
  );
  return result.rows.map((row) => {
    const accessRole = legacyProjectRole(row.role);
    return {
      id: row.id,
      name: row.name,
      key: row.key,
      archivedAt: row.archived_at,
      accessRole,
      canWrite:
        accessRole === ProjectRole.ADMIN ||
        accessRole === ProjectRole.MEMBER,
    };
  });
}

export async function getZeroProjectByID(
  id: string,
  workspaceID: string,
  userID: string,
  options?: { includeArchived?: boolean }
) {
  const access = await getZeroProjectAccess(userID, id, {
    workspaceId: workspaceID,
    includeArchived: options?.includeArchived,
  });
  if (!access) return null;
  const result = await getZeroPool().query<{
    id: string;
    name: string;
    key: string;
    archived_at: Date | null;
  }>(
    `SELECT id, name, key, archived_at
     FROM projects
     WHERE
       id = $1
       AND workspace_id = $2
       AND ($3::boolean OR archived_at IS NULL)`,
    [id, workspaceID, options?.includeArchived ?? false]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        key: row.key,
        archivedAt: row.archived_at,
      }
    : null;
}

export async function getZeroUsersForAssignee(
  workspaceID: string
) {
  const result = await getZeroPool().query<{
    id: string;
    name: string | null;
    email: string | null;
  }>(
    `SELECT
       actor.id,
       actor.display_name AS name,
       identity.provider_subject AS email
     FROM workspace_members AS membership
     JOIN users AS actor ON actor.id = membership.user_id
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = actor.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS identity ON true
     WHERE membership.workspace_id = $1
     ORDER BY actor.display_name NULLS LAST, identity.provider_subject, actor.id`,
    [workspaceID]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email ?? "",
  }));
}

export async function getZeroWorkspacesForUser(userID: string) {
  const result = await getZeroPool().query<{
    id: string;
    name: string;
    slug: string;
    created_by_id: string;
    created_at: Date;
    archived_at: Date | null;
    role: ZeroWorkspaceMemberRole;
  }>(
    `SELECT
       workspace.id,
       workspace.name,
       workspace.slug,
       workspace.created_by_id,
       workspace.created_at,
       workspace.archived_at,
       membership.role
     FROM workspace_members AS membership
     JOIN workspaces AS workspace ON workspace.id = membership.workspace_id
     WHERE membership.user_id = $1 AND workspace.archived_at IS NULL
     ORDER BY workspace.created_at, workspace.id`,
    [userID]
  );
  return result.rows.map((row) => ({
    id: `${row.id}:${userID}`,
    workspaceId: row.id,
    userId: userID,
    role: legacyWorkspaceRole(row.role),
    createdAt: row.created_at,
    workspace: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      personalOwnerId: row.created_by_id,
      createdAt: row.created_at,
    },
  }));
}

export async function getZeroWorkspace(
  field: "id" | "slug",
  value: string
) {
  const column = field === "id" ? "id" : "slug";
  const result = await getZeroPool().query<{
    id: string;
    name: string;
    slug: string;
    created_by_id: string;
    created_at: Date;
  }>(
    `SELECT id, name, slug, created_by_id, created_at
     FROM workspaces
     WHERE ${column} = $1 AND archived_at IS NULL`,
    [value]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        slug: row.slug,
        personalOwnerId: row.created_by_id,
        createdAt: row.created_at,
      }
    : null;
}

async function loadZeroTaskRows(
  accessibleProjectIDs: string[],
  archived: boolean
) {
  if (accessibleProjectIDs.length === 0) return [];
  const result = await getZeroPool().query<ZeroTaskRow>(
    `SELECT
       issue.id,
       issue.workspace_id,
       issue.project_id,
       project.key AS project_key,
       project.name AS project_name,
       project.workflow_id AS project_workflow_id,
       project.next_issue_number AS project_next_issue_number,
       project.created_at AS project_created_at,
       project.archived_at AS project_archived_at,
       issue.number,
       issue.title,
       issue.description,
       issue.type,
       issue.priority,
       state.name AS state_name,
       state.category AS state_category,
       issue.creator_id,
       creator.display_name AS creator_name,
       creator_identity.provider_subject AS creator_email,
       issue.reporter_id,
       reporter.display_name AS reporter_name,
       reporter_identity.provider_subject AS reporter_email,
       assignee.id AS assignee_id,
       assignee.display_name AS assignee_name,
       assignee_identity.provider_subject AS assignee_email,
       ARRAY(
         SELECT tag.name
         FROM issue_tags AS issue_tag
         JOIN tags AS tag ON tag.id = issue_tag.tag_id
         WHERE issue_tag.issue_id = issue.id AND tag.archived_at IS NULL
         ORDER BY tag.name
       ) AS tags,
       COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', attachment.id,
               'fileName', attachment.file_name
             )
             ORDER BY attachment.created_at, attachment.id
           )
           FROM attachments AS attachment
           WHERE
             attachment.issue_id = issue.id
             AND attachment.archived_at IS NULL
         ),
         '[]'::jsonb
       ) AS attachment_items,
       issue.created_at,
       issue.updated_at,
       issue.archived_at
     FROM issues AS issue
     JOIN projects AS project ON project.id = issue.project_id
     JOIN workflow_states AS state ON state.id = issue.state_id
     JOIN users AS creator ON creator.id = issue.creator_id
     JOIN users AS reporter ON reporter.id = issue.reporter_id
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = creator.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS creator_identity ON true
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = reporter.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS reporter_identity ON true
     LEFT JOIN LATERAL (
       SELECT actor.id, actor.display_name
       FROM issue_participants AS participant
       JOIN users AS actor ON actor.id = participant.user_id
       WHERE participant.issue_id = issue.id AND participant.role = 'ASSIGNEE'
       ORDER BY participant.created_at, actor.id
       LIMIT 1
     ) AS assignee ON true
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = assignee.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS assignee_identity ON true
     WHERE
       issue.project_id = ANY($1::uuid[])
       AND ($2::boolean = (issue.archived_at IS NOT NULL))
     ORDER BY issue.created_at DESC, issue.id DESC`,
    [accessibleProjectIDs, archived]
  );
  return result.rows;
}

const zeroStatusSQL = `CASE
  WHEN lower(trim(state.name)) IN ('backlog', 'new') THEN 'NEW'
  WHEN lower(trim(state.name)) = 'todo' THEN 'TODO'
  WHEN lower(trim(state.name)) = 'hold' THEN 'HOLD'
  WHEN lower(trim(state.name)) = 'in progress' THEN 'IN_PROGRESS'
  WHEN lower(trim(state.name)) = 'testing' THEN 'TESTING'
  WHEN lower(trim(state.name)) = 'done' THEN 'DONE'
  WHEN lower(trim(state.name)) IN ('rejected', 'canceled', 'cancelled') THEN 'REJECT'
  WHEN state.category = 'BACKLOG' THEN 'NEW'
  WHEN state.category = 'UNSTARTED' THEN 'TODO'
  WHEN state.category = 'STARTED' THEN 'IN_PROGRESS'
  WHEN state.category = 'COMPLETED' THEN 'DONE'
  WHEN state.category = 'CANCELED' THEN 'REJECT'
END`;

function buildZeroTaskFilterWhere(
  filters: IssueFilters,
  currentUserID: string | null | undefined,
  accessibleProjectIDs: string[],
  archived: boolean
) {
  const values: unknown[] = [accessibleProjectIDs, archived];
  const where = [
    "issue.project_id = ANY($1::uuid[])",
    "($2::boolean = (issue.archived_at IS NOT NULL))",
    "project.archived_at IS NULL",
  ];

  const addValue = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.q) {
    const placeholder = addValue(`%${filters.q}%`);
    where.push(`(
      issue.title ILIKE ${placeholder}
      OR COALESCE(issue.description, '') ILIKE ${placeholder}
      OR (project.key || '-' || issue.number::text) ILIKE ${placeholder}
    )`);
  }

  if (filters.view === "backlog") {
    where.push(`(${zeroStatusSQL}) = 'NEW'`);
  } else if (filters.view === "board") {
    where.push(`(${zeroStatusSQL}) = ANY(${
      addValue([...BOARD_COLUMN_STATUSES])
    }::text[])`);
  } else if (filters.status?.length) {
    where.push(`(${zeroStatusSQL}) = ANY(${addValue(filters.status)}::text[])`);
  }

  if (filters.priority?.length) {
    where.push(`issue.priority::text = ANY(${addValue(filters.priority)}::text[])`);
  }

  if (filters.tags?.length) {
    where.push(`EXISTS (
      SELECT 1
      FROM issue_tags AS filtered_issue_tag
      JOIN tags AS filtered_tag ON filtered_tag.id = filtered_issue_tag.tag_id
      WHERE
        filtered_issue_tag.issue_id = issue.id
        AND filtered_tag.archived_at IS NULL
        AND filtered_tag.name = ANY(${addValue(filters.tags)}::text[])
    )`);
  }

  if (filters.projectId) {
    if (!accessibleProjectIDs.includes(filters.projectId)) {
      where.push("false");
    } else {
      where.push(`issue.project_id = ${addValue(filters.projectId)}::uuid`);
    }
  }

  if (filters.assignee === "me") {
    if (currentUserID) {
      where.push(`assignee.id = ${addValue(currentUserID)}::uuid`);
    } else {
      where.push("false");
    }
  } else if (filters.assignee) {
    where.push(`assignee.id = ${addValue(filters.assignee)}::uuid`);
  }

  return { clause: where.join("\n       AND "), values };
}

type ZeroTaskWhere = ReturnType<typeof buildZeroTaskFilterWhere>;

async function countZeroTaskRows(where: ZeroTaskWhere) {
  const result = await getZeroPool().query<{ total_count: string }>(
    `SELECT count(*)::text AS total_count
     FROM issues AS issue
     JOIN projects AS project ON project.id = issue.project_id
     JOIN workflow_states AS state ON state.id = issue.state_id
     LEFT JOIN LATERAL (
       SELECT actor.id
       FROM issue_participants AS participant
       JOIN users AS actor ON actor.id = participant.user_id
       WHERE participant.issue_id = issue.id AND participant.role = 'ASSIGNEE'
       ORDER BY participant.created_at, actor.id
       LIMIT 1
     ) AS assignee ON true
     WHERE ${where.clause}`,
    where.values
  );
  return Number(result.rows[0]?.total_count ?? 0);
}

async function selectZeroTaskRows(
  where: ZeroTaskWhere,
  input: {
    limit: number;
    offset?: number;
  }
) {
  const queryValues = [...where.values, input.limit, input.offset ?? 0];
  const limitParam = `$${queryValues.length - 1}`;
  const offsetParam = `$${queryValues.length}`;

  const result = await getZeroPool().query<ZeroTaskRow>(
    `SELECT
       issue.id,
       issue.workspace_id,
       issue.project_id,
       project.key AS project_key,
       project.name AS project_name,
       project.workflow_id AS project_workflow_id,
       project.next_issue_number AS project_next_issue_number,
       project.created_at AS project_created_at,
       project.archived_at AS project_archived_at,
       issue.number,
       issue.title,
       issue.description,
       issue.type,
       issue.priority,
       state.name AS state_name,
       state.category AS state_category,
       issue.creator_id,
       creator.display_name AS creator_name,
       creator_identity.provider_subject AS creator_email,
       issue.reporter_id,
       reporter.display_name AS reporter_name,
       reporter_identity.provider_subject AS reporter_email,
       assignee.id AS assignee_id,
       assignee.display_name AS assignee_name,
       assignee_identity.provider_subject AS assignee_email,
       ARRAY(
         SELECT tag.name
         FROM issue_tags AS issue_tag
         JOIN tags AS tag ON tag.id = issue_tag.tag_id
         WHERE issue_tag.issue_id = issue.id AND tag.archived_at IS NULL
         ORDER BY tag.name
       ) AS tags,
       COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', attachment.id,
               'fileName', attachment.file_name
             )
             ORDER BY attachment.created_at, attachment.id
           )
           FROM attachments AS attachment
           WHERE
             attachment.issue_id = issue.id
             AND attachment.archived_at IS NULL
         ),
         '[]'::jsonb
       ) AS attachment_items,
       issue.created_at,
       issue.updated_at,
       issue.archived_at
     FROM issues AS issue
     JOIN projects AS project ON project.id = issue.project_id
     JOIN workflow_states AS state ON state.id = issue.state_id
     JOIN users AS creator ON creator.id = issue.creator_id
     JOIN users AS reporter ON reporter.id = issue.reporter_id
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = creator.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS creator_identity ON true
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = reporter.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS reporter_identity ON true
     LEFT JOIN LATERAL (
       SELECT actor.id, actor.display_name
       FROM issue_participants AS participant
       JOIN users AS actor ON actor.id = participant.user_id
       WHERE participant.issue_id = issue.id AND participant.role = 'ASSIGNEE'
       ORDER BY participant.created_at, actor.id
       LIMIT 1
     ) AS assignee ON true
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = assignee.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS assignee_identity ON true
     WHERE ${where.clause}
     ORDER BY issue.created_at DESC, issue.id DESC
     LIMIT ${limitParam}::int
     OFFSET ${offsetParam}::int`,
    queryValues
  );

  return result.rows;
}

function mapZeroTask(row: ZeroTaskRow) {
  const status = zeroStateToLegacyStatus({
    name: row.state_name,
    category: row.state_category,
  });
  const project = {
    id: row.project_id,
    key: row.project_key,
    name: row.project_name,
    nextIssueNumber: row.project_next_issue_number,
    createdAt: row.project_created_at,
    archivedAt: row.project_archived_at,
    workspaceId: row.workspace_id,
  };
  const creator = {
    id: row.creator_id,
    name: row.creator_name,
    email: row.creator_email ?? "",
  };
  const reporter = {
    id: row.reporter_id,
    name: row.reporter_name,
    email: row.reporter_email ?? "",
  };
  const assignee = row.assignee_id
    ? {
        id: row.assignee_id,
        name: row.assignee_name,
        email: row.assignee_email ?? "",
      }
    : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    status,
    isDeleted: Boolean(row.archived_at),
    deletedAt: row.archived_at,
    creatorId: row.creator_id,
    creator,
    reporterId: row.reporter_id,
    reporter,
    assigneeId: row.assignee_id,
    assignee,
    requesterName: null,
    requesterEmail: null,
    dueDate: null,
    tags: row.tags,
    attachments: row.attachment_items.map(
      (attachment) =>
        `/api/ui/issues/${encodeURIComponent(
          `${row.project_key}-${row.number}`
        )}/attachments/${encodeURIComponent(
          attachment.id
        )}/download?filename=${encodeURIComponent(attachment.fileName)}`
    ),
    projectId: row.project_id,
    project,
    number: row.number,
    key: `${row.project_key}-${row.number}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function matchesZeroTaskFilters(
  task: ReturnType<typeof mapZeroTask>,
  filters: IssueFilters,
  currentUserID?: string | null
) {
  if (filters.q) {
    const query = filters.q.toLowerCase();
    if (
      !task.title.toLowerCase().includes(query) &&
      !task.description?.toLowerCase().includes(query) &&
      !task.key.toLowerCase().includes(query)
    ) {
      return false;
    }
  }
  if (filters.view === "backlog" && task.status !== Status.NEW) return false;
  if (
    filters.view === "board" &&
    !BOARD_COLUMN_STATUSES.some((status) => status === task.status)
  ) {
    return false;
  }
  if (
    filters.view !== "backlog" &&
    filters.view !== "board" &&
    filters.status?.length &&
    !filters.status.includes(task.status)
  ) {
    return false;
  }
  if (
    filters.priority?.length &&
    !filters.priority.includes(task.priority)
  ) {
    return false;
  }
  if (
    filters.tags?.length &&
    !filters.tags.some((tag) => task.tags.includes(tag))
  ) {
    return false;
  }
  if (filters.projectId && task.projectId !== filters.projectId) return false;
  if (filters.assignee === "me" && task.assigneeId !== currentUserID) {
    return false;
  }
  if (
    filters.assignee &&
    filters.assignee !== "me" &&
    task.assigneeId !== filters.assignee
  ) {
    return false;
  }
  return !task.project.archivedAt;
}

export async function getZeroTasks(
  filters: IssueFilters,
  currentUserID: string | null | undefined,
  accessibleProjectIDs: string[]
) {
  const rows = await loadZeroTaskRows(accessibleProjectIDs, false);
  return rows
    .map(mapZeroTask)
    .filter((task) => matchesZeroTaskFilters(task, filters, currentUserID));
}

export async function getZeroPaginatedTasks(
  filters: IssueFilters,
  pagination: IssuePaginationInput,
  currentUserID: string | null | undefined,
  accessibleProjectIDs: string[]
) {
  if (accessibleProjectIDs.length === 0) {
    return {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: pagination.pageSize,
      totalPages: 1,
    };
  }

  const where = buildZeroTaskFilterWhere(
    filters,
    currentUserID,
    accessibleProjectIDs,
    false
  );
  const totalCount = await countZeroTaskRows(where);
  const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  const rows = await selectZeroTaskRows(where, {
    limit: pagination.pageSize,
    offset: (page - 1) * pagination.pageSize,
  });

  return {
    items: rows.map(mapZeroTask),
    totalCount,
    page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getZeroBoardTaskColumns(
  filters: IssueFilters,
  limits: BoardColumnLimits,
  currentUserID: string | null | undefined,
  accessibleProjectIDs: string[]
) {
  if (accessibleProjectIDs.length === 0) {
    return BOARD_COLUMN_STATUSES.map(
      (status) => ({
        status,
        items: [],
        totalCount: 0,
        limit: limits[status],
        hasMore: false,
      })
    );
  }

  const baseWhere = buildZeroTaskFilterWhere(
    filters,
    currentUserID,
    accessibleProjectIDs,
    false
  );

  return Promise.all(
    BOARD_COLUMN_STATUSES.map(
      async (status) => {
        const statusParam = `$${baseWhere.values.length + 1}`;
        const where = {
          clause: `${baseWhere.clause}\n       AND (${zeroStatusSQL}) = ${statusParam}`,
          values: [...baseWhere.values, status],
        };
        const [totalCount, rows] = await Promise.all([
          countZeroTaskRows(where),
          selectZeroTaskRows(where, { limit: limits[status] }),
        ]);

        return {
          status,
          items: rows.map(mapZeroTask),
          totalCount,
          limit: limits[status],
          hasMore: totalCount > rows.length,
        };
      }
    )
  );
}

export async function getZeroLatestTasks(
  accessibleProjectIDs: string[],
  limit: number
) {
  const rows = await loadZeroTaskRows(accessibleProjectIDs, false);
  return rows.slice(0, limit).map(mapZeroTask);
}

export async function getZeroAllTasks(accessibleProjectIDs: string[]) {
  return (await loadZeroTaskRows(accessibleProjectIDs, false)).map(mapZeroTask);
}

export async function getZeroTask(
  field: "id" | "key",
  value: string,
  accessibleProjectIDs: string[],
  options?: { archived?: boolean }
) {
  const rows = await loadZeroTaskRows(
    accessibleProjectIDs,
    options?.archived ?? false
  );
  return (
    rows
      .map(mapZeroTask)
      .find((task) => (field === "id" ? task.id : task.key) === value) ?? null
  );
}

export async function getZeroDeletedTasks(accessibleProjectIDs: string[]) {
  return (await loadZeroTaskRows(accessibleProjectIDs, true)).map(mapZeroTask);
}

export async function getZeroComments(taskID: string) {
  const result = await getZeroPool().query<{
    id: string;
    issue_id: string;
    body: string;
    author_id: string;
    created_at: Date;
    display_name: string | null;
    email: string | null;
  }>(
    `SELECT
       comment.id,
       comment.issue_id,
       comment.body,
       comment.author_id,
       comment.created_at,
       actor.display_name,
       identity.provider_subject AS email
     FROM comments AS comment
     JOIN issues AS issue ON issue.id = comment.issue_id
     JOIN users AS actor ON actor.id = comment.author_id
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = actor.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS identity ON true
     WHERE
       comment.issue_id = $1
       AND comment.archived_at IS NULL
       AND issue.archived_at IS NULL
     ORDER BY comment.created_at, comment.id`,
    [taskID]
  );
  return result.rows.map((row) => ({
    id: row.id,
    taskId: row.issue_id,
    text: row.body,
    userId: row.author_id,
    authorName: null,
    createdAt: row.created_at,
    user: {
      id: row.author_id,
      name: row.display_name,
      email: row.email ?? "",
    },
  }));
}

export async function getZeroProjectKnowledge(projectID: string) {
  const result = await getZeroPool().query<{
    provider: KnowledgeProvider;
    external_url: string | null;
    updated_at: Date;
  }>(
    `SELECT
       knowledge_provider AS provider,
       knowledge_external_url AS external_url,
       updated_at
     FROM projects
     WHERE id = $1`,
    [projectID]
  );
  const row = result.rows[0];
  return row
    ? {
        id: projectID,
        provider: row.provider,
        externalUrl: row.external_url,
        updatedAt: row.updated_at,
      }
    : {
        id: null,
        provider: KnowledgeProvider.DISABLED,
        externalUrl: null,
        updatedAt: null,
      };
}

export async function getZeroProjectByKey(
  key: string,
  workspaceID: string,
  options?: { includeArchived?: boolean }
) {
  const result = await getZeroPool().query<{
    id: string;
    key: string;
    name: string;
    archived_at: Date | null;
  }>(
    `SELECT id, key, name, archived_at
     FROM projects
     WHERE
       key = $1
       AND workspace_id = $2
       AND ($3::boolean OR archived_at IS NULL)`,
    [key.toUpperCase(), workspaceID, options?.includeArchived ?? false]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        key: row.key,
        name: row.name,
        archivedAt: row.archived_at,
      }
    : null;
}

export async function getZeroWikiPageTree(
  projectID: string,
  options?: { includeArchived?: boolean }
) {
  const result = await getZeroPool().query<{
    id: string;
    parent_id: string | null;
    title: string;
    slug: string;
    sort_order: number;
    version: number;
    archived_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT
       id, parent_id, title, slug, sort_order, version, archived_at, updated_at
     FROM wiki_pages
     WHERE project_id = $1 AND ($2::boolean OR archived_at IS NULL)
     ORDER BY sort_order, title, id`,
    [projectID, options?.includeArchived ?? false]
  );
  return result.rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    slug: row.slug,
    sortOrder: row.sort_order,
    version: row.version,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  }));
}

export async function getZeroWikiPage(projectID: string, pageID: string) {
  const result = await getZeroPool().query<{
    id: string;
    project_id: string;
    parent_id: string | null;
    title: string;
    slug: string;
    content_markdown: string;
    version: number;
    created_at: Date;
    updated_at: Date;
    created_by_id: string;
    created_by_name: string | null;
    created_by_email: string | null;
    updated_by_id: string;
    updated_by_name: string | null;
    updated_by_email: string | null;
  }>(
    `SELECT
       page.id,
       page.project_id,
       page.parent_id,
       page.title,
       page.slug,
       page.content_markdown,
       page.version,
       page.created_at,
       page.updated_at,
       page.created_by_id,
       creator.display_name AS created_by_name,
       creator_identity.provider_subject AS created_by_email,
       page.updated_by_id,
       updater.display_name AS updated_by_name,
       updater_identity.provider_subject AS updated_by_email
     FROM wiki_pages AS page
     JOIN users AS creator ON creator.id = page.created_by_id
     JOIN users AS updater ON updater.id = page.updated_by_id
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = creator.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS creator_identity ON true
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = updater.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS updater_identity ON true
     WHERE
       page.id = $1
       AND page.project_id = $2
       AND page.archived_at IS NULL`,
    [pageID, projectID]
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        projectId: row.project_id,
        parentId: row.parent_id,
        title: row.title,
        slug: row.slug,
        contentMarkdown: row.content_markdown,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: {
          id: row.created_by_id,
          name: row.created_by_name,
          email: row.created_by_email ?? "",
        },
        updatedBy: {
          id: row.updated_by_id,
          name: row.updated_by_name,
          email: row.updated_by_email ?? "",
        },
      }
    : null;
}

export async function searchZeroWikiPages(
  projectID: string,
  query: string
) {
  const result = await getZeroPool().query<{
    id: string;
    title: string;
    content_markdown: string;
    updated_at: Date;
  }>(
    `SELECT id, title, content_markdown, updated_at
     FROM wiki_pages
     WHERE
       project_id = $1
       AND archived_at IS NULL
       AND (title ILIKE $2 OR content_markdown ILIKE $2)
     ORDER BY updated_at DESC
     LIMIT 50`,
    [projectID, `%${query.trim()}%`]
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    contentMarkdown: row.content_markdown,
    updatedAt: row.updated_at,
  }));
}

export async function getZeroWikiPageRevisions(pageID: string) {
  const result = await getZeroPool().query<{
    id: string;
    version: number;
    title: string;
    created_at: Date;
    created_by_name: string | null;
    created_by_email: string | null;
  }>(
    `SELECT
       revision.id,
       revision.version,
       revision.title,
       revision.created_at,
       creator.display_name AS created_by_name,
       identity.provider_subject AS created_by_email
     FROM wiki_page_revisions AS revision
     JOIN users AS creator ON creator.id = revision.created_by_id
     LEFT JOIN LATERAL (
       SELECT provider_subject
       FROM auth_identities
       WHERE user_id = creator.id AND provider = 'password'
       ORDER BY created_at
       LIMIT 1
     ) AS identity ON true
     WHERE revision.page_id = $1
     ORDER BY revision.version DESC
     LIMIT 30`,
    [pageID]
  );
  return result.rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    createdAt: row.created_at,
    createdBy: {
      name: row.created_by_name,
      email: row.created_by_email ?? "",
    },
  }));
}

export async function getZeroTaskKnowledgeLinks(taskID: string) {
  const result = await getZeroPool().query<{
    id: string;
    page_id: string;
    title: string;
    created_at: Date;
  }>(
    `SELECT
       link.id,
       page.id AS page_id,
       page.title,
       link.created_at
     FROM issue_wiki_links AS link
     JOIN wiki_pages AS page ON page.id = link.page_id
     WHERE link.issue_id = $1 AND page.archived_at IS NULL
     ORDER BY link.created_at, link.id`,
    [taskID]
  );
  return result.rows.map((row) => ({
    id: row.id,
    provider: KnowledgeProvider.NATIVE,
    documentKey: row.page_id,
    title: row.title,
    url: null,
    createdAt: row.created_at,
  }));
}

export async function getZeroWikiProjectCards(
  workspaceID: string,
  userID: string
) {
  const result = await getZeroPool().query<{
    id: string;
    key: string;
    name: string;
    knowledge_provider: KnowledgeProvider;
    knowledge_external_url: string | null;
    page_count: number;
  }>(
    `SELECT
       project.id,
       project.key,
       project.name,
       project.knowledge_provider,
       project.knowledge_external_url,
       count(page.id)::int AS page_count
     FROM projects AS project
     JOIN workspace_members AS membership
       ON membership.workspace_id = project.workspace_id
      AND membership.user_id = $2
     LEFT JOIN wiki_pages AS page
       ON page.project_id = project.id AND page.archived_at IS NULL
     WHERE project.workspace_id = $1 AND project.archived_at IS NULL
     GROUP BY project.id
     ORDER BY project.created_at, project.id`,
    [workspaceID, userID]
  );
  return result.rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    knowledge: {
      provider: row.knowledge_provider,
      externalUrl: row.knowledge_external_url,
    },
    _count: { wikiPages: row.page_count },
  }));
}

export async function getZeroWorkspaceSettings(
  workspaceID: string,
  userID: string
) {
  const [workspaceResult, projectsResult, membersResult] = await Promise.all([
    getZeroPool().query<{ id: string; name: string }>(
      `SELECT workspace.id, workspace.name
       FROM workspaces AS workspace
       JOIN workspace_members AS membership
         ON membership.workspace_id = workspace.id
        AND membership.user_id = $2
       WHERE workspace.id = $1 AND workspace.archived_at IS NULL`,
      [workspaceID, userID]
    ),
    getZeroPool().query<{
      id: string;
      key: string;
      name: string;
      archived_at: Date | null;
      knowledge_provider: KnowledgeProvider;
      knowledge_external_url: string | null;
    }>(
      `SELECT
         project.id,
         project.key,
         project.name,
         project.archived_at,
         project.knowledge_provider,
         project.knowledge_external_url
       FROM projects AS project
       JOIN workspace_members AS membership
         ON membership.workspace_id = project.workspace_id
        AND membership.user_id = $2
       WHERE project.workspace_id = $1
       ORDER BY project.created_at, project.id`,
      [workspaceID, userID]
    ),
    getZeroPool().query<{
      user_id: string;
      role: ZeroWorkspaceMemberRole;
      created_at: Date;
      name: string | null;
      email: string | null;
    }>(
      `SELECT
         membership.user_id,
         membership.role,
         membership.created_at,
         actor.display_name AS name,
         identity.provider_subject AS email
       FROM workspace_members AS membership
       JOIN users AS actor ON actor.id = membership.user_id
       LEFT JOIN LATERAL (
         SELECT provider_subject
         FROM auth_identities
         WHERE user_id = actor.id AND provider = 'password'
         ORDER BY created_at
         LIMIT 1
       ) AS identity ON true
       WHERE membership.workspace_id = $1
       ORDER BY membership.created_at, membership.user_id`,
      [workspaceID]
    ),
  ]);
  const workspace = workspaceResult.rows[0] ?? null;
  const projects = projectsResult.rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    archivedAt: row.archived_at,
    knowledge: {
      provider: row.knowledge_provider,
      externalUrl: row.knowledge_external_url,
    },
  }));
  const members = membersResult.rows.map((row) => ({
    id: row.user_id,
    role: legacyWorkspaceRole(row.role),
    createdAt: row.created_at,
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email ?? "",
    },
  }));
  return { workspace, projects, members, projectMembers: [] };
}
