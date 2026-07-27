import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import { addCommentApiSchema } from "@/server/api/schemas";
import { addApiComment } from "@/server/api/zero-domain";

export const dynamic = "force-dynamic";

type CommentRouteProps = {
  params: Promise<{ key: string }>;
};

export async function POST(request: Request, { params }: CommentRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = addCommentApiSchema.parse(await readJsonBody(request));
    const { key } = await params;
    const result = await runIdempotentCommand(context, {
      key: idempotencyKey,
      operation: `issues.comment:${key.trim().toUpperCase()}`,
      statusCode: 201,
      execute: () => addApiComment(context.user, key, input),
      audit: (comment) => ({
        action: "issue.comment.create",
        resourceType: "comment",
        resourceId: comment.id,
        metadata: { issueKey: key.trim().toUpperCase() },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
