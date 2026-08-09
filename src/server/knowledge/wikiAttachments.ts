import { randomUUID } from "node:crypto";
import type { AttachmentUploadInput } from "@/server/attachments/policy";
import {
  attachmentObjectKeys,
  createPresignedAttachmentDownload,
  createPresignedAttachmentUpload,
  deleteAttachmentObject,
  promotePendingAttachment,
} from "@/server/attachments/s3";
import { ApiError } from "@/server/api/errors";
import { getZeroPool } from "@/zero/db";

type WikiAttachmentActor = {
  id: string;
};

async function requireWikiPage(input: {
  userID: string;
  pageID: string;
  write: boolean;
}) {
  const roles = input.write
    ? ["OWNER", "ADMIN", "MEMBER"]
    : ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
  const result = await getZeroPool().query<{
    id: string;
    workspace_id: string;
    project_id: string;
  }>(
    `SELECT page.id, page.workspace_id, page.project_id
     FROM wiki_pages AS page
     JOIN projects AS project ON project.id = page.project_id
     JOIN workspace_members AS membership
       ON membership.workspace_id = page.workspace_id
      AND membership.user_id = $2
     WHERE
       page.id = $1
       AND page.archived_at IS NULL
       AND project.archived_at IS NULL
       AND project.knowledge_provider = 'NATIVE'
       AND membership.role = ANY($3::text[])`,
    [input.pageID, input.userID, roles]
  );
  const page = result.rows[0];
  if (!page) {
    throw new ApiError(404, "wiki_page_not_found", "Wiki-страница не найдена");
  }
  return page;
}

export async function prepareWikiAttachmentUpload(
  user: WikiAttachmentActor,
  pageID: string,
  file: AttachmentUploadInput
) {
  const page = await requireWikiPage({ userID: user.id, pageID, write: true });
  const attachmentID = randomUUID();
  return createPresignedAttachmentUpload({
    workspaceID: page.workspace_id,
    issueID: page.id,
    attachmentID,
    file,
  });
}

export async function confirmWikiAttachment(input: {
  user: WikiAttachmentActor;
  pageID: string;
  attachmentID: string;
  onPromoted: (objectKey: string) => void;
}) {
  const page = await requireWikiPage({
    userID: input.user.id,
    pageID: input.pageID,
    write: true,
  });
  const client = await getZeroPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`wiki-attachment:${input.attachmentID}`]
    );
    const existing = await client.query<{
      id: string;
      file_name: string;
      content_type: string;
    }>(
      `SELECT id, file_name, content_type
       FROM wiki_attachments
       WHERE id = $1 AND page_id = $2 AND archived_at IS NULL`,
      [input.attachmentID, page.id]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return {
        id: existing.rows[0].id,
        fileName: existing.rows[0].file_name,
        contentType: existing.rows[0].content_type,
      };
    }

    const promoted = await promotePendingAttachment({
      workspaceID: page.workspace_id,
      issueID: page.id,
      attachmentID: input.attachmentID,
    });
    input.onPromoted(promoted.objectKey);
    await client.query(
      `INSERT INTO wiki_attachments (
         id, workspace_id, project_id, page_id, object_key,
         file_name, content_type, size_bytes, uploaded_by_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.attachmentID,
        page.workspace_id,
        page.project_id,
        page.id,
        promoted.objectKey,
        promoted.fileName,
        promoted.contentType,
        promoted.sizeBytes,
        input.user.id,
      ]
    );
    await client.query("COMMIT");
    return {
      id: input.attachmentID,
      fileName: promoted.fileName,
      contentType: promoted.contentType,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function removePendingWikiAttachment(input: {
  user: WikiAttachmentActor;
  pageID: string;
  attachmentID: string;
}) {
  const page = await requireWikiPage({
    userID: input.user.id,
    pageID: input.pageID,
    write: true,
  });
  const { pending } = attachmentObjectKeys({
    workspaceID: page.workspace_id,
    issueID: page.id,
    attachmentID: input.attachmentID,
  });
  await deleteAttachmentObject(pending);
}

export async function getWikiAttachmentDownload(input: {
  user: WikiAttachmentActor;
  pageID: string;
  attachmentID: string;
}) {
  await requireWikiPage({ userID: input.user.id, pageID: input.pageID, write: false });
  const result = await getZeroPool().query<{
    object_key: string;
    file_name: string;
    content_type: string;
  }>(
    `SELECT object_key, file_name, content_type
     FROM wiki_attachments
     WHERE id = $1 AND page_id = $2 AND archived_at IS NULL`,
    [input.attachmentID, input.pageID]
  );
  const attachment = result.rows[0];
  if (!attachment) {
    throw new ApiError(404, "wiki_attachment_not_found", "Вложение не найдено");
  }
  return createPresignedAttachmentDownload({
    objectKey: attachment.object_key,
    fileName: attachment.file_name,
    contentType: attachment.content_type,
    disposition: attachment.content_type.startsWith("image/")
      ? "inline"
      : "attachment",
  });
}
