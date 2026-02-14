"use client";

import { useEffect } from "react";
import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RealtimeEvent, RealtimeTask } from "@/types/realtime";

type QueryKey = readonly [string, string];
type QueryFilters = { queryKey: QueryKey; exact?: boolean };

type QueryDataUpdater<TData> = (prev: TData | undefined) => TData | undefined;

interface QueryClientLike<TData> {
  setQueryData: (queryKey: QueryKey, updater: QueryDataUpdater<TData>) => void;
  invalidateQueries?: (filters: QueryFilters) => Promise<unknown> | unknown;
  refetchQueries?: (filters: QueryFilters) => Promise<unknown> | unknown;
}

export type BoardCache = RealtimeTask[] | { tasks: RealtimeTask[] };

interface UseBoardRealtimeOptions {
  boardId: string | null;
  enabled?: boolean;
  forceRefresh?: boolean;
  queryClient?: QueryClientLike<BoardCache>;
  setState?: Dispatch<SetStateAction<BoardCache | RealtimeTask[]>>;
  onEvent?: (event: RealtimeEvent) => void;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMergeRecord<T extends object>(base: T, patch: Partial<T>): T {
  const merged = { ...base } as T;
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const patchValue = patch[key];
    if (typeof patchValue === "undefined") continue;

    const baseValue = merged[key];
    if (isObjectRecord(baseValue) && isObjectRecord(patchValue)) {
      merged[key] = deepMergeRecord(
        baseValue,
        patchValue as Partial<typeof baseValue>
      ) as T[keyof T];
      continue;
    }

    merged[key] = patchValue as T[keyof T];
  }

  return merged;
}

function applyEventToTasks(prevTasks: RealtimeTask[], event: RealtimeEvent): RealtimeTask[] {
  switch (event.type) {
    case "task_created": {
      const existingIndex = prevTasks.findIndex((task) => task.id === event.payload.task.id);
      if (existingIndex >= 0) {
        const next = [...prevTasks];
        next[existingIndex] = event.payload.task;
        return next;
      }
      return [event.payload.task, ...prevTasks];
    }
    case "task_updated":
      return prevTasks.map((task) =>
        task.id === event.payload.task.id ? deepMergeRecord(task, event.payload.task) : task
      );
    case "task_deleted":
      return prevTasks.filter((task) => task.id !== event.payload.taskId);
    case "comment_added":
      return prevTasks;
  }
}

function applyEventToBoardCache(prev: BoardCache | undefined, event: RealtimeEvent): BoardCache | undefined {
  if (!prev) return prev;
  if (Array.isArray(prev)) {
    return applyEventToTasks(prev, event);
  }
  return {
    ...prev,
    tasks: applyEventToTasks(prev.tasks, event),
  };
}

export function useBoardRealtime({
  boardId,
  enabled = true,
  forceRefresh = false,
  queryClient,
  setState,
  onEvent,
}: UseBoardRealtimeOptions) {
  const onEventRef = useRef(onEvent);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !boardId) return;

    const scheduleQueryRefresh = () => {
      if (!queryClient) return;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(() => {
        void (async () => {
          const filters: QueryFilters = { queryKey: ["board", boardId], exact: true };
          let invalidateSucceeded = false;

          if (queryClient.invalidateQueries) {
            try {
              await queryClient.invalidateQueries(filters);
              invalidateSucceeded = true;
            } catch {
              invalidateSucceeded = false;
            }
          }

          if (!invalidateSucceeded || forceRefresh) {
            if (queryClient.refetchQueries) {
              try {
                await queryClient.refetchQueries(filters);
              } catch {
                // no-op
              }
            }
          }
        })();
      }, 400);
    };

    const params = new URLSearchParams({ boardId });
    const eventSource = new EventSource(`/api/realtime?${params.toString()}`);
    console.log(`[SSE client] connect boardId=${boardId}`);

    eventSource.onmessage = (message) => {
      if (!message.data) return;

      let parsed: RealtimeEvent | { type: "heartbeat" };
      try {
        parsed = JSON.parse(message.data) as RealtimeEvent | { type: "heartbeat" };
      } catch {
        return;
      }

      if (parsed.type === "heartbeat") return;
      console.log(`[SSE client] message boardId=${boardId} type=${parsed.type}`);

      queryClient?.setQueryData(["board", boardId], (prev) =>
        applyEventToBoardCache(prev, parsed)
      );

      if (parsed.type === "task_updated") {
        scheduleQueryRefresh();
      }

      if (setState) {
        setState((prev) => applyEventToBoardCache(prev, parsed) ?? prev);
      }

      onEventRef.current?.(parsed);
    };

    eventSource.onerror = () => {
      console.log(`[SSE client] error boardId=${boardId}`);
      // Browser will auto-reconnect EventSource by default.
    };

    return () => {
      console.log(`[SSE client] close boardId=${boardId}`);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      eventSource.close();
    };
  }, [boardId, enabled, forceRefresh, queryClient, setState]);
}
