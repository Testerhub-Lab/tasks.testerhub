import { authenticateApiRequest } from "@/server/api/auth";
import { apiData, apiErrorResponse, readJsonBody } from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import { createReleaseApiSchema } from "@/server/api/schemas";
import { listApiReleases, requireApiReleaseProject } from "@/server/api/zero-release-domain";
import { saveProjectRelease } from "@/server/queries/releases";

export const dynamic = "force-dynamic";

type ReleaseRouteProps = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(request: Request, { params }: ReleaseRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["projects:read"]);
    const { projectKey } = await params;
    return apiData(await listApiReleases(context.user, projectKey));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: ReleaseRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["projects:write"]);
    const key = requireIdempotencyKey(request);
    const input = createReleaseApiSchema.parse(await readJsonBody(request));
    const { projectKey } = await params;
    const project = await requireApiReleaseProject(context.user, projectKey, true);
    const result = await runIdempotentCommand(context, {
      key,
      operation: `release.create:${project.id}`,
      statusCode: 201,
      execute: (tx) => saveProjectRelease(project.id, input, tx),
      audit: (release) => ({
        action: "release.create",
        resourceType: "release",
        resourceId: release.id,
        metadata: { projectKey: project.key },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
