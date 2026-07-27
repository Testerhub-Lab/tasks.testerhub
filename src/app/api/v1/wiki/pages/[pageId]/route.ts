import prisma from "@/lib/prisma";
import { recordApiAudit } from "@/server/api/audit";
import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { updateWikiPageApiSchema } from "@/server/api/schemas";
import {
  getApiWikiPage,
  updateApiWikiPage,
} from "@/server/api/zero-wiki-domain";

export const dynamic = "force-dynamic";

type WikiPageRouteProps = {
  params: Promise<{ pageId: string }>;
};

export async function GET(request: Request, { params }: WikiPageRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:read"]);
    const { pageId } = await params;
    return apiData(await getApiWikiPage(context.user, pageId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: WikiPageRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["wiki:write"]);
    const input = updateWikiPageApiSchema.parse(await readJsonBody(request));
    const { pageId } = await params;
    const page = await updateApiWikiPage(context.user, pageId, input);
    await recordApiAudit(prisma, context, {
      action: "wiki.page.update",
      resourceType: "wiki_page",
      resourceId: page.id,
      metadata: {
        projectKey: page.project.key,
        version: page.version,
        fields: Object.keys(input),
      },
    });
    return apiData(page);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
