import type { Priority, Status } from "@prisma/client";

export type RealtimeEventType =
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "comment_added";

export interface RealtimeTask {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string | null;
  type: string;
  priority: Priority;
  status: Status;
  assigneeId: string | null;
  requesterName: string | null;
  createdAt: string;
}

export interface RealtimeComment {
  id: string;
  taskId: string;
  text: string;
  userId: string | null;
  authorName: string | null;
  createdAt: string;
}

export interface TaskCreatedEvent {
  type: "task_created";
  payload: {
    task: RealtimeTask;
  };
}

export interface TaskUpdatedEvent {
  type: "task_updated";
  payload: {
    task: Partial<RealtimeTask> & Pick<RealtimeTask, "id" | "projectId">;
  };
}

export interface TaskDeletedEvent {
  type: "task_deleted";
  payload: {
    taskId: string;
    projectId: string;
  };
}

export interface CommentAddedEvent {
  type: "comment_added";
  payload: {
    projectId: string;
    comment: RealtimeComment;
  };
}

export type RealtimeEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | CommentAddedEvent;

export interface HeartbeatEvent {
  type: "heartbeat";
}
