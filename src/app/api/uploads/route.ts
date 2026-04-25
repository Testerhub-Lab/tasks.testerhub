import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

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
    const form = await req.formData();

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

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await ensureDir(uploadDir);

    const uploaded: UploadResultItem[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i]!;
      const m = metaItems[i]!;

      const ext = path.extname(f.name);
      const base = path.basename(f.name, ext);
      const storedName = `${makeId()}-${safeName(base)}${ext || ""}`;

      const fullPath = path.join(uploadDir, storedName);
      const buf = Buffer.from(await f.arrayBuffer());
      await fs.writeFile(fullPath, buf);

      uploaded.push({
        clientId: m.clientId,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        storedName,
        url: `/uploads/${storedName}`,
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
    const body = (await req.json().catch(() => null)) as { url?: string } | null;
    const url = body?.url;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
    }

    // Разрешаем удалять только из /uploads/
    if (!url.startsWith("/uploads/")) {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }

    const filename = url.replace("/uploads/", "");
    const fullPath = path.join(process.cwd(), "public", "uploads", filename);

    await fs.unlink(fullPath).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: toErrorMessage(e) },
      { status: 500 }
    );
  }
}
