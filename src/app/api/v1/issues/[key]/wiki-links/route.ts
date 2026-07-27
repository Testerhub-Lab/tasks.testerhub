import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import { linkWikiPageApiSchema } from "@/server/api/schemas";
import { linkApiIssueToWiki } from "@/server/api/zero-wiki-domain";

export const dynamic = "force-dynamic";

type WikiLinkRouteProps = {
  params: Promise<{ key: string }>;
};

export async function POST(request: Request, { params }: WikiLinkRouteProps) {
  try {
    const context = await authenticateApiRequest(request, [
      "issues:write",
      "wiki:read",
    ]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = linkWikiPageApiSchema.parse(await readJsonBody(request));
    const { key } = await params;
    const result = await runIdempotentCommand(context, {
      key: idempotencyKey,
      operation: `issues.wiki-link:${key.trim().toUpperCase()}`,
      statusCode: 201,
      execute: (tx) =>
        linkApiIssueToWiki(context.user, key, input.pageId, tx),
      audit: (link) => ({
        action: "issue.wiki_link.create",
        resourceType: "knowledge_link",
        resourceId: link.id,
        metadata: {
          issueKey: link.issueKey,
          pageId: link.documentKey,
        },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
