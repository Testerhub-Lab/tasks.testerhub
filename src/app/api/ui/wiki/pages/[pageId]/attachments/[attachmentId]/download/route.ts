import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { apiErrorResponse } from "@/server/api/errors";
import { getWikiAttachmentDownload } from "@/server/knowledge/wikiAttachments";

export const dynamic = "force-dynamic";

type DownloadWikiAttachmentRouteProps = {
  params: Promise<{ pageId: string; attachmentId: string }>;
};

export async function GET(
  _request: Request,
  { params }: DownloadWikiAttachmentRouteProps
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const raw = await params;
    const pageID = z.string().uuid().parse(raw.pageId);
    const attachmentID = z.string().uuid().parse(raw.attachmentId);
    const result = await getWikiAttachmentDownload({
      user,
      pageID,
      attachmentID,
    });
    return NextResponse.redirect(result.downloadUrl, 307);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
