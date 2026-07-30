import prisma from "../../lib/prisma";
import { Status, type Prisma } from "@prisma/client";
import {
  resolveBoardColumnStatuses,
  type BoardColumnLimits,
  type BoardColumnStatus,
  type IssueFilters,
  type IssuePageSize,
  type IssuePaginationInput,
} from "../validators/issueFilters";
import {
  getZeroAllTasks,
  getZeroComments,
  getZeroDeletedTasks,
  getZeroLatestTasks,
  getZeroBoardTaskColumns,
  getZeroPaginatedTasks,
  getZeroTask,
  getZeroTasks,
  usesZeroUiStore,
} from "@/server/ui/zero-legacy";

export type TaskWithProject = Prisma.TaskGetPayload<{
  include: { project: true };
}>;

export type TaskListItem = Prisma.TaskGetPayload<{
  include: {
    project: true;
    reporter: { select: { id: true; name: true; email: true } };
    assignee: { select: { id: true; name: true; email: true } };
  };
}>;

export type TaskWithProjectAndReporter = Prisma.TaskGetPayload<{
  include: {
    project: true;
    reporter: { select: { id: true; name: true; email: true } };
    assignee: { select: { id: true; name: true; email: true } };
  };
}>;

export type PaginatedTasks = {
  items: TaskListItem[];
  totalCount: number;
  page: number;
  pageSize: IssuePageSize;
  totalPages: number;
};

export type BoardTaskColumn = {
  status: BoardColumnStatus;
  items: TaskListItem[];
  totalCount: number;
  limit: number;
  hasMore: boolean;
};

export const buildTaskWhere = (
  filters: IssueFilters,
  currentUserId?: string | null,
  accessibleProjectIds: string[] = []
): Prisma.TaskWhereInput => {
  const where: Prisma.TaskWhereInput = {
    isDeleted: false,
  };

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
      { key: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  // Backlog view is a focused view of NEW issues.
  if (filters.view === "backlog") {
    where.status = Status.NEW;
  }
  // Board shows committed work; NEW issues stay in the Backlog view.
  else if (filters.view === "board") {
    where.status = { in: resolveBoardColumnStatuses(filters) };
  }
  // ✅ Остальные страницы: если status-фильтр есть — применяем
  else if (filters.status?.length) {
    where.status = { in: filters.status };
  }

  if (filters.priority?.length) {
    where.priority = { in: filters.priority };
  }

  if (filters.tags?.length) {
    where.tags = { hasSome: filters.tags };
  }

  if (filters.projectId) {
    where.projectId = accessibleProjectIds.includes(filters.projectId)
      ? filters.projectId
      : "__no-access__";
  } else {
    where.projectId = { in: accessibleProjectIds };
  }

  if (filters.assignee) {
    if (filters.assignee === "me") {
      if (currentUserId) {
        where.assigneeId = currentUserId;
      } else {
        where.id = "__no-user__";
      }
    } else {
      where.assigneeId = filters.assignee;
    }
  }

  where.project = { archivedAt: null };

  return where;
};

export async function getTasks(
  filters: IssueFilters,
  currentUserId?: string | null,
  accessibleProjectIds: string[] = []
): Promise<TaskListItem[]> {
  if (usesZeroUiStore()) {
    return getZeroTasks(
      filters,
      currentUserId,
      accessibleProjectIds
    ) as Promise<TaskListItem[]>;
  }
  return prisma.task.findMany({
    where: buildTaskWhere(filters, currentUserId, accessibleProjectIds),
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPaginatedTasks(
  filters: IssueFilters,
  pagination: IssuePaginationInput,
  currentUserId?: string | null,
  accessibleProjectIds: string[] = []
): Promise<PaginatedTasks> {
  const requestedPage = Math.max(1, pagination.page);

  if (usesZeroUiStore()) {
    return getZeroPaginatedTasks(
      filters,
      pagination,
      currentUserId,
      accessibleProjectIds
    ) as Promise<PaginatedTasks>;
  }

  const where = buildTaskWhere(filters, currentUserId, accessibleProjectIds);
  const totalCount = await prisma.task.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const page = Math.min(requestedPage, totalPages);
  const items = await prisma.task.findMany({
    where,
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  });

  return {
    items,
    totalCount,
    page,
    pageSize: pagination.pageSize,
    totalPages,
  };
}

export async function getBoardTaskColumns(
  filters: IssueFilters,
  limits: BoardColumnLimits,
  currentUserId?: string | null,
  accessibleProjectIds: string[] = []
): Promise<BoardTaskColumn[]> {
  const queryFilters: IssueFilters = {
    ...filters,
    view: "board",
  };

  if (usesZeroUiStore()) {
    return getZeroBoardTaskColumns(
      queryFilters,
      limits,
      currentUserId,
      accessibleProjectIds
    ) as Promise<BoardTaskColumn[]>;
  }

  const baseWhere = buildTaskWhere(
    queryFilters,
    currentUserId,
    accessibleProjectIds
  );
  const columnStatuses = resolveBoardColumnStatuses(queryFilters);

  return Promise.all(
    columnStatuses.map(async (status) => {
      const where: Prisma.TaskWhereInput = {
        ...baseWhere,
        status,
      };
      const [totalCount, items] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          include: {
            project: true,
            reporter: { select: { id: true, name: true, email: true } },
            assignee: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limits[status],
        }),
      ]);

      return {
        status,
        items,
        totalCount,
        limit: limits[status],
        hasMore: totalCount > items.length,
      };
    })
  );
}

export async function getLatestTasks(
  accessibleProjectIds: string[],
  limit = 10
): Promise<TaskListItem[]> {
  if (usesZeroUiStore()) {
    return getZeroLatestTasks(
      accessibleProjectIds,
      limit
    ) as Promise<TaskListItem[]>;
  }
  return prisma.task.findMany({
    where: { isDeleted: false, projectId: { in: accessibleProjectIds } },
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getAllTasks(
  accessibleProjectIds: string[]
): Promise<TaskListItem[]> {
  if (usesZeroUiStore()) {
    return getZeroAllTasks(accessibleProjectIds) as Promise<TaskListItem[]>;
  }
  return prisma.task.findMany({
    where: { isDeleted: false, projectId: { in: accessibleProjectIds } },
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBacklogUnreadCount(
  since?: Date | null,
  accessibleProjectIds: string[] = []
) {
  if (usesZeroUiStore()) {
    return 0;
  }
  const sinceDate = since ?? new Date(0);
  return prisma.task.count({
    where: {
      isDeleted: false,
      status: Status.NEW,
      createdAt: { gt: sinceDate },
      projectId: { in: accessibleProjectIds },
      project: { archivedAt: null },
    },
  });
}

export async function getTaskById(
  id: string,
  accessibleProjectIds: string[]
): Promise<TaskWithProjectAndReporter | null> {
  if (usesZeroUiStore()) {
    return getZeroTask(
      "id",
      id,
      accessibleProjectIds
    ) as Promise<TaskWithProjectAndReporter | null>;
  }
  return prisma.task.findFirst({
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    where: { id, isDeleted: false, projectId: { in: accessibleProjectIds } },
  });
}

export async function getTaskByKey(
  key: string,
  accessibleProjectIds: string[]
): Promise<TaskWithProjectAndReporter | null> {
  if (usesZeroUiStore()) {
    return getZeroTask(
      "key",
      key,
      accessibleProjectIds
    ) as Promise<TaskWithProjectAndReporter | null>;
  }
  return prisma.task.findFirst({
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    where: { key, isDeleted: false, projectId: { in: accessibleProjectIds } },
  });
}

export async function getTaskActivitiesByTaskId(taskId: string) {
  if (usesZeroUiStore()) {
    return [];
  }
  return prisma.taskActivity.findMany({
    where: { taskId, task: { isDeleted: false } },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCommentsByTaskId(taskId: string) {
  if (usesZeroUiStore()) {
    return getZeroComments(taskId);
  }
  return prisma.comment.findMany({
    where: { taskId, task: { isDeleted: false } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      taskId: true,
      text: true,
      userId: true,
      authorName: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function getDeletedTasks(
  accessibleProjectIds: string[]
): Promise<TaskListItem[]> {
  if (usesZeroUiStore()) {
    return getZeroDeletedTasks(
      accessibleProjectIds
    ) as Promise<TaskListItem[]>;
  }
  return prisma.task.findMany({
    where: {
      isDeleted: true,
      projectId: { in: accessibleProjectIds },
    },
    include: {
      project: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { deletedAt: "desc" },
  });
}
