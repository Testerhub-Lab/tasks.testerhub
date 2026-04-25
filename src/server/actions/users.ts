"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "../auth/session";

export async function markBacklogSeenAction() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenBacklogAt: new Date() },
  });

  return { ok: true as const };
}
