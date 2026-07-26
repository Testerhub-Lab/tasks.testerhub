import { ProjectRole } from "@prisma/client";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hasProjectRole } from "@/server/auth/access";
import { getCurrentUser } from "@/server/auth/session";

type ExportRouteProps = {
  params: Promise<{ projectId: string }>;
};

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

export async function GET(_request: Request, { params }: ExportRouteProps) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await hasProjectRole(user, projectId, ProjectRole.VIEWER, {
    includeArchived: true,
  });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      key: true,
      name: true,
      wikiPages: {
        where: { archivedAt: null },
        select: {
          id: true,
          parentId: true,
          title: true,
          contentMarkdown: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sections: string[] = [
    `# ${project.key} · ${project.name}`,
    "",
    `Экспортировано: ${new Date().toISOString()}`,
  ];

  const appendChildren = (parentId: string | null, depth: number) => {
    for (const page of project.wikiPages.filter(
      (candidate) => candidate.parentId === parentId
    )) {
      sections.push("", `${"#".repeat(Math.min(depth + 2, 6))} ${page.title}`, "");
      sections.push(page.contentMarkdown.trim() || "_Страница пуста._");
      appendChildren(page.id, depth + 1);
    }
  };
  appendChildren(null, 0);

  return new NextResponse(sections.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(
        project.key
      )}-wiki.md"`,
    },
  });
}
