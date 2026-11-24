import { authenticateApiRequest } from "@/server/api/auth";
import { apiData, apiErrorResponse, readJsonBody } from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import { addReleaseIssuesApiSchema, releaseIDApiSchema } from "@/server/api/schemas";
import { addApiReleaseIssues, requireApiReleaseProject } from "@/server/api/zero-release-domain";

export const dynamic = "force-dynamic";

type ReleaseIssuesRouteProps = {
  params: Promise<{ projectKey: string; releaseId: string }>;
};

export async function POST(request: Request, { params }: ReleaseIssuesRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["projects:write", "issues:write"]);
    const key = requireIdempotencyKey(request);
    const { issueKeys } = addReleaseIssuesApiSchema.parse(await readJsonBody(request));
    const { projectKey, releaseId } = await params;
    const id = releaseIDApiSchema.parse(releaseId);
    const project = await requireApiReleaseProject(context.user, projectKey, true);
    const result = await runIdempotentCommand(context, {
      key,
      operation: `release.issues.add:${project.id}:${id}`,
      statusCode: 200,
      execute: (tx) => addApiReleaseIssues(project, id, issueKeys, tx),
      audit: (added) => ({
        action: "release.issues.add",
        resourceType: "release",
        resourceId: added.releaseId,
        metadata: { projectKey: project.key, issueKeys: added.issueKeys },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
