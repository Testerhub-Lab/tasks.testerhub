import { authenticateApiRequest } from "@/server/api/auth";
import {
  apiData,
  apiErrorResponse,
  readJsonBody,
} from "@/server/api/errors";
import { prepareAttachmentUploadApiSchema } from "@/server/api/schemas";
import {
  listApiAttachments,
  prepareApiAttachmentUpload,
} from "@/server/api/zero-attachment-domain";

export const dynamic = "force-dynamic";

type AttachmentRouteProps = {
  params: Promise<{ key: string }>;
};

export async function GET(request: Request, { params }: AttachmentRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:read"]);
    const { key } = await params;
    return apiData(await listApiAttachments(context.user, key));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: AttachmentRouteProps) {
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const input = prepareAttachmentUploadApiSchema.parse(
      await readJsonBody(request)
    );
    const { key } = await params;
    const response = apiData(
      await prepareApiAttachmentUpload(context.user, key, input),
      201
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
