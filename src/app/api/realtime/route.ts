import { NextResponse } from "next/server";
import { sseManager } from "@/lib/sse";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { getCurrentUser } from "@/server/auth/session";
import { getProjectAccess, getWorkspaceRole } from "@/server/auth/access";

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

  const authUser = await getCurrentUser();
  if (!authUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (boardId.startsWith("workspace:")) {
    const requestedWorkspaceId = boardId.slice("workspace:".length);
    if (!requestedWorkspaceId || requestedWorkspaceId !== workspaceId) {
      return NextResponse.json({ ok: false, error: "Board not found" }, { status: 404 });
    }
    const workspaceRole = await getWorkspaceRole(authUser, workspaceId);
    if (workspaceRole !== "ADMIN") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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

  const access = await getProjectAccess(authUser, boardId, { workspaceId });
  if (!access) {
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
