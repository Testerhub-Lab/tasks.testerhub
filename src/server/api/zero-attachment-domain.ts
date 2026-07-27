import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  getZeroDatabase,
  type ZeroTransaction,
} from "@/zero/db";
import { requireWorkspaceRole } from "@/zero/authorization";
import { zeroQueries } from "@/zero/queries";
import {
  attachmentObjectKeys,
  createPresignedAttachmentDownload,
  createPresignedAttachmentUpload,
  deleteAttachmentObject,
  promotePendingAttachment,
} from "@/server/attachments/s3";
import type { ApiActor } from "./auth";
import { ApiError } from "./errors";
import type { prepareAttachmentUploadApiSchema } from "./schemas";
import { requireApiIssueByKey } from "./zero-domain";

type PrepareAttachmentUploadInput = z.infer<
  typeof prepareAttachmentUploadApiSchema
>;

function iso(value: number) {
  return new Date(value).toISOString();
}

function serializeAttachment(attachment: {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByID: string;
  createdAt: number;
  uploader?: { displayName?: string | null };
}) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    uploadedById: attachment.uploadedByID,
    uploadedBy: attachment.uploader
      ? {
          id: attachment.uploadedByID,
          name: attachment.uploader.displayName ?? null,
          email: null,
        }
      : null,
    createdAt: iso(attachment.createdAt),
  };
}

function requireWriter(role: string | null) {
  if (!role || role === "VIEWER") {
    throw new ApiError(403, "forbidden", "Issue write access denied");
  }
}

async function attachmentRows(
  userID: string,
  issueID: string,
  transaction?: ZeroTransaction
) {
  const query = zeroQueries.attachments.byIssue.fn({
    args: { issueID },
    ctx: { userID },
  });
  return transaction
    ? transaction.run(query)
    : getZeroDatabase().run(query);
}

export async function listApiAttachments(user: ApiActor, key: string) {
  const row = await requireApiIssueByKey(user.id, key);
  return (await attachmentRows(user.id, row.issue.id)).map(
    serializeAttachment
  );
}

export async function prepareApiAttachmentUpload(
  user: ApiActor,
  key: string,
  input: PrepareAttachmentUploadInput
) {
  const row = await requireApiIssueByKey(user.id, key);
  requireWriter(row.role);
  const attachmentID = randomUUID();
  return createPresignedAttachmentUpload({
    workspaceID: row.workspace.id,
    issueID: row.issue.id,
    attachmentID,
    file: input,
  });
}

export async function confirmApiAttachment(
  user: ApiActor,
  key: string,
  attachmentID: string,
  transaction: ZeroTransaction,
  onPromoted: (objectKey: string) => void
) {
  const row = await requireApiIssueByKey(user.id, key);
  requireWriter(row.role);
  await requireWorkspaceRole(
    transaction,
    row.workspace.id,
    user.id,
    "MEMBER"
  );
  await transaction.dbTransaction.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`attachment:${attachmentID}`]
  );

  const existing = (await attachmentRows(user.id, row.issue.id, transaction))
    .find((attachment) => attachment.id === attachmentID);
  if (existing) return serializeAttachment(existing);

  const promoted = await promotePendingAttachment({
    workspaceID: row.workspace.id,
    issueID: row.issue.id,
    attachmentID,
  });
  onPromoted(promoted.objectKey);
  await transaction.mutate.attachment.insert({
    id: attachmentID,
    workspaceID: row.workspace.id,
    issueID: row.issue.id,
    objectKey: promoted.objectKey,
    fileName: promoted.fileName,
    contentType: promoted.contentType,
    sizeBytes: promoted.sizeBytes,
    uploadedByID: user.id,
    createdAt: Date.now(),
  });

  const created = (await attachmentRows(user.id, row.issue.id, transaction))
    .find((attachment) => attachment.id === attachmentID);
  if (!created) {
    throw new ApiError(
      500,
      "attachment_not_found_after_create",
      "Созданное вложение не найдено"
    );
  }
  return serializeAttachment(created);
}

async function requireApiAttachment(
  user: ApiActor,
  key: string,
  attachmentID: string
) {
  const row = await requireApiIssueByKey(user.id, key);
  const attachment = (await attachmentRows(user.id, row.issue.id)).find(
    (candidate) => candidate.id === attachmentID
  );
  if (!attachment) {
    throw new ApiError(
      404,
      "attachment_not_found",
      "Вложение не найдено"
    );
  }
  return { attachment, row };
}

export async function getApiAttachmentDownload(
  user: ApiActor,
  key: string,
  attachmentID: string
) {
  const { attachment } = await requireApiAttachment(user, key, attachmentID);
  return {
    attachment: serializeAttachment(attachment),
    ...(await createPresignedAttachmentDownload({
      objectKey: attachment.objectKey,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
    })),
  };
}

export async function removePendingApiAttachment(
  user: ApiActor,
  key: string,
  attachmentID: string
) {
  const row = await requireApiIssueByKey(user.id, key);
  const { pending } = attachmentObjectKeys({
    workspaceID: row.workspace.id,
    issueID: row.issue.id,
    attachmentID,
  });
  await deleteAttachmentObject(pending);
}
