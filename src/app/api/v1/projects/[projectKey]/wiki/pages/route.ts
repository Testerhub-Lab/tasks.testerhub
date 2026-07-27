import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import { createWikiPageApiSchema } from "@/server/api/schemas";
import {
  createApiWikiPage,
  listApiWikiPages,
} from "@/server/api/zero-wiki-domain";

export const dynamic = "force-dynamic";

type ProjectWikiRouteProps = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(
  request: Request,
  { params }: ProjectWikiRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:read"]);
    const { projectKey } = await params;
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    return apiData(
      await listApiWikiPages(context.user, projectKey, query)
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: ProjectWikiRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const input = createWikiPageApiSchema.parse(await readJsonBody(request));
    const { projectKey } = await params;
    const result = await runIdempotentCommand(context, {
      key: idempotencyKey,
      operation: `wiki.page.create:${projectKey.trim().toUpperCase()}`,
      statusCode: 201,
      execute: (tx) =>
        createApiWikiPage(context.user, projectKey, input, tx),
      audit: (page) => ({
        action: "wiki.page.create",
        resourceType: "wiki_page",
        resourceId: page.id,
        metadata: {
          projectKey: page.project.key,
          title: page.title,
        },
      }),
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
