import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { apiErrorResponse } from "@/server/api/errors";
import { deleteAttachmentObject } from "@/server/attachments/s3";
import {
  confirmWikiAttachment,
  removePendingWikiAttachment,
} from "@/server/knowledge/wikiAttachments";

export const dynamic = "force-dynamic";

type ConfirmWikiAttachmentRouteProps = {
  params: Promise<{ pageId: string; attachmentId: string }>;
};

export async function POST(
  _request: Request,
  { params }: ConfirmWikiAttachmentRouteProps
) {
  let promotedObjectKey: string | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const raw = await params;
    const pageID = z.string().uuid().parse(raw.pageId);
    const attachmentID = z.string().uuid().parse(raw.attachmentId);
    const attachment = await confirmWikiAttachment({
      user,
      pageID,
      attachmentID,
      onPromoted: (objectKey) => {
        promotedObjectKey = objectKey;
      },
    });
    promotedObjectKey = undefined;
    await removePendingWikiAttachment({ user, pageID, attachmentID }).catch(
      (error) => {
        console.error("[wiki-attachments] pending cleanup failed", error);
      }
    );
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    if (promotedObjectKey) {
      await deleteAttachmentObject(promotedObjectKey).catch((cleanupError) => {
        console.error("[wiki-attachments] promoted rollback failed", cleanupError);
      });
    }
    return apiErrorResponse(error);
  }
}
