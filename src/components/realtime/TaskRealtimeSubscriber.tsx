"use client";

import { useRouter } from "next/navigation";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";

interface TaskRealtimeSubscriberProps {
  boardId: string;
  taskId: string;
}

const TaskRealtimeSubscriber = ({ boardId, taskId }: TaskRealtimeSubscriberProps) => {
  const router = useRouter();

  useBoardRealtime({
    boardId,
    enabled: Boolean(boardId && taskId),
    onEvent: (event) => {
      if (
        event.type === "task_updated" &&
        event.payload.task.id === taskId
      ) {
        router.refresh();
        return;
      }

      if (
        event.type === "task_deleted" &&
        event.payload.taskId === taskId
      ) {
        router.refresh();
        return;
      }

      if (
        event.type === "comment_added" &&
        event.payload.comment.taskId === taskId
      ) {
        router.refresh();
      }
    },
  });

  return null;
};

export default TaskRealtimeSubscriber;
