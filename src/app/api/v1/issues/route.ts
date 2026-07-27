import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import {
  createIssueApiSchema,
  issueSearchQuerySchema,
  issueStatusSchema,
} from "@/server/api/schemas";
import {
  createApiIssue,
  searchApiIssues,
} from "@/server/api/zero-domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["issues:read"]);
    const url = new URL(request.url);
    const statusValues = url.searchParams
      .getAll("status")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const statuses = statusValues.map((status) =>
      issueStatusSchema.parse(status)
    );
    const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 50;

    return apiData(
      await searchApiIssues(context.user, {
        projectKey: url.searchParams.get("projectKey"),
        query: issueSearchQuerySchema.parse(url.searchParams.get("q") ?? ""),
        statuses,
        limit,
      })
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = createIssueApiSchema.parse(await readJsonBody(request));
    const result = await runIdempotentCommand(context, {
      key: idempotencyKey,
      operation: "issues.create",
      statusCode: 201,
      execute: (tx) => createApiIssue(context.user, input, tx),
      audit: (issue) => ({
        action: "issue.create",
        resourceType: "issue",
        resourceId: issue.id,
        metadata: { key: issue.key },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
