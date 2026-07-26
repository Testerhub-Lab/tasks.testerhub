import prisma from "@/lib/prisma";
import { createWikiSlug } from "@/server/knowledge/slug";
import { ApiError } from "./errors";

export async function requireNativeWiki(project: {
  knowledge: { provider: string } | null;
}) {
  if (project.knowledge?.provider !== "NATIVE") {
    throw new ApiError(
      409,
      "wiki_not_native",
      "Для проекта не включена нативная Wiki"
    );
  }
}

export async function getUniqueWikiSlug(projectId: string, title: string) {
  const base = createWikiSlug(title);
  const matches = await prisma.wikiPage.findMany({
    where: {
      projectId,
      OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
    },
    select: { slug: true },
  });
  const existing = new Set(matches.map((page) => page.slug));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
