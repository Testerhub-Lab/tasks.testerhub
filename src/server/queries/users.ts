import prisma from "@/lib/prisma";

export type UserOption = { id: string; name: string | null; email: string };

export async function getUsersForAssignee(): Promise<UserOption[]> {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}
