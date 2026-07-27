import { authenticateApiRequest } from "@/server/api/auth";
import { apiData, apiErrorResponse } from "@/server/api/errors";
import { runIdempotentCommand } from "@/server/api/idempotent-command";
import { requireIdempotencyKey } from "@/server/api/idempotency";
import {
  confirmApiAttachment,
  removePendingApiAttachment,
} from "@/server/api/zero-attachment-domain";
import { attachmentIDApiSchema } from "@/server/api/schemas";
import { deleteAttachmentObject } from "@/server/attachments/s3";

export const dynamic = "force-dynamic";

type ConfirmAttachmentRouteProps = {
  params: Promise<{ key: string; attachmentId: string }>;
};

export async function POST(
  request: Request,
  { params }: ConfirmAttachmentRouteProps
) {
  let promotedObjectKey: string | undefined;
  try {
    const context = await authenticateApiRequest(request, ["issues:write"]);
    const idempotencyKey = requireIdempotencyKey(request);
    const { key, attachmentId: rawAttachmentID } = await params;
    const attachmentID = attachmentIDApiSchema.parse(rawAttachmentID);
    const normalizedKey = key.trim().toUpperCase();
    const result = await runIdempotentCommand(context, {
      key: idempotencyKey,
      operation: `issues.attachment.confirm:${normalizedKey}:${attachmentID}`,
      statusCode: 201,
      execute: (tx) =>
        confirmApiAttachment(
          context.user,
          normalizedKey,
          attachmentID,
          tx,
          (objectKey) => {
            promotedObjectKey = objectKey;
          }
        ),
      audit: (attachment) => ({
        action: "issue.attachment.create",
        resourceType: "attachment",
        resourceId: attachment.id,
        metadata: {
          issueKey: normalizedKey,
          contentType: attachment.contentType,
          sizeBytes: attachment.sizeBytes,
        },
      }),
    });
    promotedObjectKey = undefined;
    await removePendingApiAttachment(
      context.user,
      normalizedKey,
      attachmentID
    ).catch((error) => {
      console.error("[attachments] pending object cleanup failed", error);
    });
    return apiData(result.response, result.statusCode);
  } catch (error) {
    if (promotedObjectKey) {
      await deleteAttachmentObject(promotedObjectKey).catch((cleanupError) => {
        console.error("[attachments] promoted object rollback failed", cleanupError);
      });
    }
    return apiErrorResponse(error);
  }
}
