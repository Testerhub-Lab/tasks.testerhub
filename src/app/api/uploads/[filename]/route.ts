import { promises as fs } from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { getProjectAccess } from "@/server/auth/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSafeFilename(filename: string): boolean {
  return (
    filename.length > 0 &&
    filename.length <= 220 &&
    path.basename(filename) === filename &&
    /^[a-zA-Z0-9._-]+$/.test(filename)
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { filename } = await context.params;
  if (!isSafeFilename(filename)) return new Response("Not found", { status: 404 });

  const upload = await prisma.upload.findUnique({
    where: { storedName: filename },
    select: {
      projectId: true,
      originalName: true,
      contentType: true,
    },
  });
  if (!upload) return new Response("Not found", { status: 404 });
  const access = await getProjectAccess(user, upload.projectId, {
    includeArchived: true,
  });
  if (!access) return new Response("Not found", { status: 404 });

  const uploadDir =
    process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");
  const fullPath = path.join(uploadDir, filename);

  try {
    const file = await fs.readFile(fullPath);
    return new Response(file, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.originalName)}`,
        "Content-Type": upload.contentType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
