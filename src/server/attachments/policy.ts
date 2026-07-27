import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
  "application/gzip",
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/zip",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
] as const;

const allowedContentTypes = new Set<string>(ATTACHMENT_CONTENT_TYPES);

export const attachmentUploadInputSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      "Имя файла содержит управляющие символы"
    ),
  contentType: z
    .string()
    .transform((value) => value.split(";", 1)[0]!.trim().toLowerCase())
    .refine(
      (value) => allowedContentTypes.has(value),
      "Этот тип файла не поддерживается"
    ),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});

export type AttachmentUploadInput = z.infer<
  typeof attachmentUploadInputSchema
>;
