import { Role } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateApiRequest } from "@/server/api/auth";
import { apiData, apiErrorResponse } from "@/server/api/errors";
import { listAccessibleProjects } from "@/server/api/projects";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["projects:read"]);
    const [workspaces, projects] = await Promise.all([
      context.user.role === Role.ADMIN
        ? prisma.workspace.findMany({
            select: {
              id: true,
              name: true,
              slug: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : prisma.workspaceMember
            .findMany({
              where: { userId: context.user.id },
              select: {
                role: true,
                workspace: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            })
            .then((memberships) =>
              memberships.map((membership) => ({
                ...membership.workspace,
                role: membership.role,
              }))
            ),
      listAccessibleProjects(context.user),
    ]);

    const projectCounts = new Map<string, number>();
    for (const project of projects) {
      projectCounts.set(
        project.workspace.id,
        (projectCounts.get(project.workspace.id) ?? 0) + 1
      );
    }

    return apiData(
      workspaces.map((workspace) => ({
        ...workspace,
        role: "role" in workspace ? workspace.role : "ADMIN",
        projectCount: projectCounts.get(workspace.id) ?? 0,
      }))
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
