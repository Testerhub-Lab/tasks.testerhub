"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "../auth/session";
import { usesZeroUiStore } from "@/server/ui/zero-legacy";

export async function markBacklogSeenAction() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };
  if (usesZeroUiStore()) return { ok: true as const };

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenBacklogAt: new Date() },
  });

  return { ok: true as const };
}
