import prisma from "@/lib/prisma";

export type UserOption = { id: string; name: string | null; email: string };

export async function getUsersForAssignee(workspaceId: string): Promise<UserOption[]> {
  return prisma.user.findMany({
    where: { workspaceMemberships: { some: { workspaceId } } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}
