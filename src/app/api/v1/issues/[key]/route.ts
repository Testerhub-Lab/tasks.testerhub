import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { runAuditedCommand } from "@/server/api/idempotent-command";
import { updateIssueApiSchema } from "@/server/api/schemas";
import {
  getApiIssue,
  updateApiIssue,
} from "@/server/api/zero-domain";

export const dynamic = "force-dynamic";

type IssueRouteProps = {
  params: Promise<{ key: string }>;
};

export async function GET(request: Request, { params }: IssueRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:read"]);
    const { key } = await params;
    return apiData(await getApiIssue(context.user, key));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: IssueRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const input = updateIssueApiSchema.parse(await readJsonBody(request));
    const { key } = await params;
    const issue = await runAuditedCommand(context, {
      execute: (tx) => updateApiIssue(context.user, key, input, tx),
      audit: (updated) => ({
        action: "issue.update",
        resourceType: "issue",
        resourceId: updated.id,
        metadata: {
          key: updated.key,
          fields: Object.keys(input),
        },
      }),
    });
    return apiData(issue);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
