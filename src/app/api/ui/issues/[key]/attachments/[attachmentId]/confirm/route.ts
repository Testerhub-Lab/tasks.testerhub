import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import {
  confirmApiAttachment,
  removePendingApiAttachment,
} from "@/server/api/zero-attachment-domain";
import { attachmentIDApiSchema } from "@/server/api/schemas";
import { apiErrorResponse } from "@/server/api/errors";
import { deleteAttachmentObject } from "@/server/attachments/s3";
import { getZeroDatabase } from "@/zero/db";

export const dynamic = "force-dynamic";

type ConfirmRouteProps = {
  params: Promise<{ key: string; attachmentId: string }>;
};

export async function POST(
  _request: Request,
  { params }: ConfirmRouteProps
) {
  let promotedObjectKey: string | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { key, attachmentId: rawAttachmentID } = await params;
    const attachmentID = attachmentIDApiSchema.parse(rawAttachmentID);
    const sessionActor = { id: user.id, email: null, name: user.name };
    const attachment = await getZeroDatabase().transaction((tx) =>
      confirmApiAttachment(
        sessionActor,
        key,
        attachmentID,
        tx,
        (objectKey) => {
          promotedObjectKey = objectKey;
        }
      )
    );
    promotedObjectKey = undefined;
    await removePendingApiAttachment(
      sessionActor,
      key,
      attachmentID
    ).catch((error) => {
      console.error("[attachments:ui] pending cleanup failed", error);
    });
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    if (promotedObjectKey) {
      await deleteAttachmentObject(promotedObjectKey).catch((cleanupError) => {
        console.error(
          "[attachments:ui] promoted rollback failed",
          cleanupError
        );
      });
    }
    return apiErrorResponse(error);
  }
}
