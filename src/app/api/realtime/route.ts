import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sseManager } from "@/lib/sse";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId");

  if (!boardId) {
    return NextResponse.json(
      { ok: false, error: "boardId is required" },
      { status: 400 }
    );
  }

  const [workspaceId, authUser] = await Promise.all([
    getCurrentWorkspaceId(),
    getCurrentUser(),
  ]);

  if (boardId.startsWith("workspace:")) {
    const requestedWorkspaceId = boardId.slice("workspace:".length);
    if (!requestedWorkspaceId || requestedWorkspaceId !== workspaceId) {
      return NextResponse.json({ ok: false, error: "Board not found" }, { status: 404 });
    }

    const stream = sseManager.connect(boardId, request.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const project = await prisma.project.findFirst({
    where: { id: boardId, workspaceId, archivedAt: null },
    select: { id: true, allowGuest: true },
  });

  if (!project) {
    return NextResponse.json({ ok: false, error: "Board not found" }, { status: 404 });
  }

  if (!authUser && !project.allowGuest) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const stream = sseManager.connect(boardId, request.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
