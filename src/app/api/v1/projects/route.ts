import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import { createProjectApiSchema } from "@/server/api/schemas";
import {
  createApiProject,
  listApiProjects,
} from "@/server/api/zero-domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["projects:read"]);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const projects = await listApiProjects(
      context.user,
      workspaceId
    );
    return apiData(projects);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["projects:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = createProjectApiSchema.parse(await readJsonBody(request));
    const result = await runIdempotentCommand(context, {
      key: idempotencyKey,
      operation: "projects.create",
      statusCode: 201,
      execute: (tx) => createApiProject(context.user, input, tx),
      audit: (project) => ({
        action: "project.create",
        resourceType: "project",
        resourceId: project.id,
        metadata: { key: project.key },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
