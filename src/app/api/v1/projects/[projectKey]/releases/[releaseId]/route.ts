import { authenticateApiRequest } from "@/server/api/auth";
import { ApiError, apiData, apiErrorResponse, readJsonBody } from "@/server/api/errors";
import { runAuditedCommand } from "@/server/api/idempotent-command";
import { releaseIDApiSchema, updateReleaseApiSchema } from "@/server/api/schemas";
import { requireApiReleaseProject } from "@/server/api/zero-release-domain";
import { updateProjectRelease } from "@/server/queries/releases";

export const dynamic = "force-dynamic";

type ReleaseRouteProps = {
  params: Promise<{ projectKey: string; releaseId: string }>;
};

export async function PATCH(request: Request, { params }: ReleaseRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["projects:write"]);
    const input = updateReleaseApiSchema.parse(await readJsonBody(request));
    const { projectKey, releaseId } = await params;
    const id = releaseIDApiSchema.parse(releaseId);
    const project = await requireApiReleaseProject(context.user, projectKey, true);
    const release = await runAuditedCommand(context, {
      execute: async (tx) => {
        const updated = await updateProjectRelease(project.id, id, input, tx);
        if (!updated) throw new ApiError(404, "release_not_found", "Релиз не найден");
        return updated;
      },
      audit: (updated) => ({
        action: "release.update",
        resourceType: "release",
        resourceId: updated.id,
        metadata: { projectKey: project.key, fields: Object.keys(input) },
      }),
    });
    return apiData(release);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
