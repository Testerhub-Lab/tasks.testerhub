import SidebarClient from "./SidebarClient";
import { getProjects } from "@/server/queries/projects";
import { getBacklogUnreadCount } from "@/server/queries/tasks";
import { getCurrentUser } from "@/server/auth/session";
import prisma from "@/lib/prisma";

export default async function Sidebar() {
  const projects = await getProjects();
  const user = await getCurrentUser();
  let backlogUnread = 0;

  if (user) {
    const meta = await prisma.user.findUnique({
      where: { id: user.id },
      select: { lastSeenBacklogAt: true },
    });
    backlogUnread = await getBacklogUnreadCount(meta?.lastSeenBacklogAt ?? null);
  }

  return <SidebarClient projects={projects} backlogUnread={backlogUnread} />;
}
