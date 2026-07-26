import { apiData, apiErrorResponse } from "@/server/api/errors";
import { authenticateApiRequest } from "@/server/api/auth";
import { listAccessibleProjects } from "@/server/api/projects";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["projects:read"]);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const projects = await listAccessibleProjects(
      context.user,
      workspaceId
    );
    return apiData(projects);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
