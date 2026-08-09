import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { apiErrorResponse } from "@/server/api/errors";
import { prepareAttachmentUploadApiSchema } from "@/server/api/schemas";
import { prepareWikiAttachmentUpload } from "@/server/knowledge/wikiAttachments";

export const dynamic = "force-dynamic";

type WikiAttachmentRouteProps = {
  params: Promise<{ pageId: string }>;
};

export async function POST(
  request: Request,
  { params }: WikiAttachmentRouteProps
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { pageId: rawPageID } = await params;
    const pageID = z.string().uuid().parse(rawPageID);
    const file = prepareAttachmentUploadApiSchema.parse(await request.json());
    const upload = await prepareWikiAttachmentUpload(user, pageID, file);
    const response = NextResponse.json({ ok: true, ...upload }, { status: 201 });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
