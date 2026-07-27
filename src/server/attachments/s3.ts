import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { ApiError } from "../api/errors";
import {
  attachmentUploadInputSchema,
  type AttachmentUploadInput,
} from "./policy";

const PRESIGNED_URL_TTL_SECONDS = 5 * 60;

const storageConfigSchema = z.object({
  endpoint: z.string().url(),
  publicEndpoint: z.string().url(),
  region: z.string().trim().min(1),
  bucket: z.string().trim().min(3).max(255),
  accessKeyID: z.string().trim().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean(),
});

export type AttachmentStorageConfig = z.infer<typeof storageConfigSchema>;

export function readAttachmentStorageConfig(
  env: Record<string, string | undefined> = process.env
): AttachmentStorageConfig {
  try {
    const endpoint = env.S3_ENDPOINT?.trim() ?? "";
    return storageConfigSchema.parse({
      endpoint,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT?.trim() || endpoint,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyID: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE?.trim().toLowerCase() !== "false",
    });
  } catch {
    throw new ApiError(
      503,
      "attachment_storage_unavailable",
      "Хранилище вложений не настроено"
    );
  }
}

function storageClient(config: AttachmentStorageConfig, endpoint: string) {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyID,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

let cached:
  | {
      key: string;
      direct: S3Client;
      presigner: S3Client;
    }
  | undefined;

function storageClients(config: AttachmentStorageConfig) {
  const key = JSON.stringify(config);
  if (!cached || cached.key !== key) {
    cached?.direct.destroy();
    if (cached?.presigner !== cached?.direct) cached?.presigner.destroy();
    const direct = storageClient(config, config.endpoint);
    const presigner =
      config.publicEndpoint === config.endpoint
        ? direct
        : storageClient(config, config.publicEndpoint);
    cached = { key, direct, presigner };
  }
  return cached;
}

export function attachmentObjectKeys(input: {
  workspaceID: string;
  issueID: string;
  attachmentID: string;
}) {
  const suffix =
    `workspaces/${input.workspaceID}/issues/${input.issueID}/` +
    input.attachmentID;
  return {
    pending: `pending/${suffix}`,
    final: `attachments/${suffix}`,
  };
}

function encodedFileName(fileName: string) {
  return Buffer.from(fileName, "utf8").toString("base64url");
}

function decodedFileName(value: string | undefined) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return encodedFileName(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function uploadMetadata(input: {
  workspaceID: string;
  issueID: string;
  attachmentID: string;
  file: AttachmentUploadInput;
}) {
  return {
    "pulsar-workspace-id": input.workspaceID,
    "pulsar-issue-id": input.issueID,
    "pulsar-attachment-id": input.attachmentID,
    "pulsar-file-name": encodedFileName(input.file.fileName),
    "pulsar-content-type": input.file.contentType,
    "pulsar-size-bytes": String(input.file.sizeBytes),
  };
}

export async function createPresignedAttachmentUpload(input: {
  workspaceID: string;
  issueID: string;
  attachmentID: string;
  file: AttachmentUploadInput;
}) {
  const config = readAttachmentStorageConfig();
  const { presigner } = storageClients(config);
  const keys = attachmentObjectKeys(input);
  const metadata = uploadMetadata(input);
  const uploadURL = await getSignedUrl(
    presigner,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: keys.pending,
      ContentLength: input.file.sizeBytes,
      ContentType: input.file.contentType,
      Metadata: metadata,
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS }
  );

  return {
    attachmentId: input.attachmentID,
    uploadUrl: uploadURL,
    expiresAt: new Date(
      Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000
    ).toISOString(),
    headers: {
      "content-type": input.file.contentType,
    },
  };
}

function copySource(bucket: string, key: string) {
  return `/${encodeURIComponent(bucket)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function storageFailure(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const status =
    error &&
    typeof error === "object" &&
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
      ? error.$metadata.httpStatusCode
      : undefined;
  if (status === 404) {
    throw new ApiError(
      409,
      "attachment_upload_missing",
      "Загруженный объект не найден или URL уже истёк"
    );
  }
  throw new ApiError(
    502,
    "attachment_storage_error",
    "Хранилище вложений временно недоступно"
  );
}

export async function promotePendingAttachment(input: {
  workspaceID: string;
  issueID: string;
  attachmentID: string;
}) {
  const config = readAttachmentStorageConfig();
  const { direct } = storageClients(config);
  const keys = attachmentObjectKeys(input);

  try {
    const head = await direct.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: keys.pending,
      })
    );
    const metadata = head.Metadata ?? {};
    const fileName = decodedFileName(metadata["pulsar-file-name"]);
    const declaredSize = Number(metadata["pulsar-size-bytes"]);
    const candidate = attachmentUploadInputSchema.safeParse({
      fileName,
      contentType: head.ContentType,
      sizeBytes: head.ContentLength,
    });
    if (
      !candidate.success ||
      declaredSize !== candidate.data.sizeBytes ||
      metadata["pulsar-workspace-id"] !== input.workspaceID ||
      metadata["pulsar-issue-id"] !== input.issueID ||
      metadata["pulsar-attachment-id"] !== input.attachmentID ||
      metadata["pulsar-content-type"] !== candidate.data.contentType
    ) {
      throw new ApiError(
        409,
        "attachment_upload_mismatch",
        "Загруженный объект не соответствует выданному upload URL"
      );
    }

    await direct.send(
      new CopyObjectCommand({
        Bucket: config.bucket,
        Key: keys.final,
        CopySource: copySource(config.bucket, keys.pending),
        MetadataDirective: "COPY",
      })
    );

    return {
      objectKey: keys.final,
      fileName: candidate.data.fileName,
      contentType: candidate.data.contentType,
      sizeBytes: candidate.data.sizeBytes,
    };
  } catch (error) {
    storageFailure(error);
  }
}

export async function createPresignedAttachmentDownload(input: {
  objectKey: string;
  fileName: string;
  contentType: string;
}) {
  const config = readAttachmentStorageConfig();
  const { presigner } = storageClients(config);
  const downloadURL = await getSignedUrl(
    presigner,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      ResponseContentDisposition:
        `attachment; filename*=UTF-8''${encodeURIComponent(input.fileName)}`,
      ResponseContentType: input.contentType,
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS }
  );
  return {
    downloadUrl: downloadURL,
    expiresAt: new Date(
      Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000
    ).toISOString(),
  };
}

export async function deleteAttachmentObject(objectKey: string) {
  const config = readAttachmentStorageConfig();
  const { direct } = storageClients(config);
  await direct.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    })
  );
}
