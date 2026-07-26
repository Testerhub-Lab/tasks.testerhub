import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { ProjectRole } from "@prisma/client";
import { getCurrentUser } from "@/server/auth/session";
import { hasProjectRole } from "@/server/auth/access";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

type UploadMetaItem = {
  clientId: string;
  name: string;
  size: number;
  type: string;
};

type UploadResultItem = UploadMetaItem & {
  url: string;
  storedName: string;
};

function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 140 ? base.slice(-140) : base;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {

    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const projectId = form.get("projectId");
    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ ok: false, error: "Missing projectId" }, { status: 400 });
    }
    const access = await hasProjectRole(user, projectId, ProjectRole.MEMBER);
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    const metaRaw = form.get("meta");

    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
    }
    if (typeof metaRaw !== "string") {
      return NextResponse.json({ ok: false, error: "Missing meta" }, { status: 400 });
    }

    const meta = JSON.parse(metaRaw) as unknown;
    if (!Array.isArray(meta)) {
      return NextResponse.json({ ok: false, error: "Invalid meta" }, { status: 400 });
    }

    const metaItems: UploadMetaItem[] = meta.map((x) => x as UploadMetaItem);

    if (metaItems.length !== files.length) {
      return NextResponse.json(
        { ok: false, error: "Meta length mismatch" },
        { status: 400 }
      );
    }

    // Limits (подстрой под себя)
    const MAX_FILES = 10;
    const MAX_SIZE_MB = 25;
    const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, error: `Too many files (max ${MAX_FILES})` },
        { status: 400 }
      );
    }

    for (const f of files) {
      if (f.size > MAX_SIZE) {
        return NextResponse.json(
          { ok: false, error: `File too large: ${f.name} (max ${MAX_SIZE_MB}MB)` },
          { status: 400 }
        );
      }
    }

    const uploadDir = process.env.UPLOAD_DIR
      ? path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR)
      : path.join(process.cwd(), "data", "uploads");
    await ensureDir(uploadDir);

    const uploaded: UploadResultItem[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i]!;
      const m = metaItems[i]!;

      const ext = path.extname(f.name);
      const base = path.basename(f.name, ext);
      const storedName = `${makeId()}-${safeName(base)}${ext || ""}`;

      const fullPath = process.env.UPLOAD_DIR
        ? path.join(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR, storedName)
        : path.join(process.cwd(), "data", "uploads", storedName);
      const buf = Buffer.from(await f.arrayBuffer());
      await fs.writeFile(fullPath, buf);
      try {
        await prisma.upload.create({
          data: {
            storedName,
            originalName: f.name,
            contentType: f.type || "application/octet-stream",
            size: f.size,
            projectId,
            uploadedById: user.id,
          },
          select: { id: true },
        });
      } catch (error) {
        await fs.unlink(fullPath).catch(() => null);
        throw error;
      }

      uploaded.push({
        clientId: m.clientId,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        storedName,
        url: `/api/uploads/${storedName}`,
      });
    }

    return NextResponse.json({ ok: true, files: uploaded });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      url?: string;
      projectId?: string;
    } | null;
    const url = body?.url;
    const projectId = body?.projectId;

    if (
      !url ||
      typeof url !== "string" ||
      !projectId ||
      typeof projectId !== "string"
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing url or projectId" },
        { status: 400 }
      );
    }

    // Разрешаем удалять только файлы из защищённого upload API.
    if (!url.startsWith("/api/uploads/")) {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }

    const filename = url.replace("/api/uploads/", "");
    if (path.basename(filename) !== filename) {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }
    const upload = await prisma.upload.findUnique({
      where: { storedName: filename },
      select: { id: true, projectId: true },
    });
    if (!upload || upload.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "File not found" }, { status: 404 });
    }

    const access = await hasProjectRole(
      user,
      upload.projectId,
      ProjectRole.MEMBER
    );
    if (!access) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const fullPath = process.env.UPLOAD_DIR
      ? path.join(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR, filename)
      : path.join(process.cwd(), "data", "uploads", filename);

    await prisma.upload.delete({ where: { id: upload.id } });
    await fs.unlink(fullPath).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(e) },
      { status: 500 }
    );
  }
}
