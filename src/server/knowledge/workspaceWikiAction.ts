"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { getCurrentWorkspaceId } from "@/server/auth/workspace";
import { saveWorkspaceArticle, type WorkspaceArticle } from "./workspaceWiki";

const articleInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  markdown: z.string().max(200_000),
  version: z.number().int().nonnegative(),
});

export async function saveWorkspaceArticleAction(
  workspaceId: string,
  article: WorkspaceArticle
): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || await getCurrentWorkspaceId() !== workspaceId) {
    return { error: "Рабочее пространство изменилось. Откройте Wiki заново." };
  }
  const parsed = articleInput.safeParse(article);
  if (!parsed.success) return { error: "Проверьте название и длину текста страницы." };
  if (!await saveWorkspaceArticle({ workspaceId, userId: user.id }, parsed.data)) {
    return { error: "Сохранение недоступно. Проверьте права и актуальную версию страницы." };
  }
  revalidatePath("/wiki");
  revalidatePath(`/wiki/-/${article.id}`);
  return { id: article.id };
}
