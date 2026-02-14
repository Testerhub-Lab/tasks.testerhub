import { randomUUID } from "crypto";
import type { RealtimeEvent } from "@/types/realtime";

type SSEController = ReadableStreamDefaultController<Uint8Array>;

class SSEManager {
  private readonly encoder = new TextEncoder();
  private readonly clients = new Map<string, Set<SSEController>>();
  private readonly clientIds = new WeakMap<SSEController, string>();

  connect(boardId: string, signal: AbortSignal): ReadableStream<Uint8Array> {
    const heartbeatFrame = this.encoder.encode('data: {"type":"heartbeat"}\n\n');
    let controllerRef: SSEController | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (controllerRef) {
        this.removeClient(boardId, controllerRef);
        try {
          controllerRef.close();
        } catch {
          // stream already closed
        }
      }

      signal.removeEventListener("abort", cleanup);
    };

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        controllerRef = controller;
        this.addClient(boardId, controller);
        console.log(`[SSE connect] boardId=${boardId}, client connected, PID=${process.pid}`);

        const sendHeartbeat = () => {
          try {
            controller.enqueue(heartbeatFrame);
          } catch {
            cleanup();
          }
        };

        sendHeartbeat();
        heartbeatTimer = setInterval(sendHeartbeat, 20_000);
        signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel: () => {
        cleanup();
      },
    });
  }

  async broadcast(boardId: string, event: RealtimeEvent): Promise<void> {
    const boardClients = this.clients.get(boardId);
    console.log(
      `[SSE broadcast] boardId=${boardId}, clients=${boardClients?.size || 0}, worker PID=${process.pid}`
    );
    if (!boardClients || boardClients.size === 0) return;

    const frame = this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const controller of boardClients) {
      try {
        controller.enqueue(frame);
      } catch {
        this.removeClient(boardId, controller);
      }
    }
  }

  removeClient(boardId: string, controller: SSEController): void {
    const boardClients = this.clients.get(boardId);
    if (!boardClients) return;

    boardClients.delete(controller);
    this.clientIds.delete(controller);
    if (boardClients.size === 0) {
      this.clients.delete(boardId);
    }
  }

  private addClient(boardId: string, controller: SSEController): void {
    const boardClients = this.clients.get(boardId) ?? new Set<SSEController>();
    boardClients.add(controller);
    this.clients.set(boardId, boardClients);
    this.clientIds.set(controller, randomUUID());
  }
}

const globalSSE = globalThis as typeof globalThis & {
  __sseManager?: SSEManager;
};

export const sseManager = globalSSE.__sseManager ?? new SSEManager();

if (!globalSSE.__sseManager) {
  globalSSE.__sseManager = sseManager;
}
