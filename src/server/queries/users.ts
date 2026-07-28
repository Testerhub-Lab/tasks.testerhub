import prisma from "@/lib/prisma";
import {
  getZeroUsersForAssignee,
  usesZeroUiStore,
} from "@/server/ui/zero-legacy";

export type UserOption = { id: string; name: string | null; email: string };

export async function getUsersForAssignee(
  workspaceId: string,
  accessibleProjectIds: string[]
): Promise<UserOption[]> {
  if (usesZeroUiStore()) {
    return getZeroUsersForAssignee(workspaceId);
  }
  const now = new Date();
  return prisma.user.findMany({
    where: {
      OR: [
        {
          workspaceMemberships: {
            some: { workspaceId, role: "ADMIN" },
          },
        },
        {
          projectMemberships: {
            some: {
              projectId: { in: accessibleProjectIds },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}
