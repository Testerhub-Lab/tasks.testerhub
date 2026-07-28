import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getApiAttachmentDownload } from "@/server/api/zero-attachment-domain";
import { attachmentIDApiSchema } from "@/server/api/schemas";
import { apiErrorResponse } from "@/server/api/errors";

export const dynamic = "force-dynamic";

type DownloadRouteProps = {
  params: Promise<{ key: string; attachmentId: string }>;
};

export async function GET(
  _request: Request,
  { params }: DownloadRouteProps
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { key, attachmentId } = await params;
    const result = await getApiAttachmentDownload(
      { id: user.id, email: null, name: user.name },
      key,
      attachmentIDApiSchema.parse(attachmentId)
    );
    return NextResponse.redirect(result.downloadUrl, 307);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
