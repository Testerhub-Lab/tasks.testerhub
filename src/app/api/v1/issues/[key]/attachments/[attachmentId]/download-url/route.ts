import { authenticateApiRequest } from "@/server/api/auth";
import { apiData, apiErrorResponse } from "@/server/api/errors";
import { attachmentIDApiSchema } from "@/server/api/schemas";
import { getApiAttachmentDownload } from "@/server/api/zero-attachment-domain";

export const dynamic = "force-dynamic";

type DownloadAttachmentRouteProps = {
  params: Promise<{ key: string; attachmentId: string }>;
};

export async function GET(
  request: Request,
  { params }: DownloadAttachmentRouteProps
) {
  try {
    const context = await authenticateApiRequest(request, ["issues:read"]);
    const { key, attachmentId } = await params;
    const response = apiData(
      await getApiAttachmentDownload(
        context.user,
        key,
        attachmentIDApiSchema.parse(attachmentId)
      )
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
