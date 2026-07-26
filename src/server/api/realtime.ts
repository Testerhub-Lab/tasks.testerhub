import { sseManager } from "@/lib/sse";
import type { RealtimeEvent } from "@/types/realtime";

export async function broadcastApiEvent(
  projectId: string,
  workspaceId: string,
  event: RealtimeEvent
) {
  await Promise.all([
    sseManager.broadcast(projectId, event),
    sseManager.broadcast(`workspace:${workspaceId}`, event),
  ]);
}
