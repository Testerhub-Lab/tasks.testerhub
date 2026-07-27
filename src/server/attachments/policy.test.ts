import { describe, expect, it } from "vitest";
import {
  attachmentUploadInputSchema,
  MAX_ATTACHMENT_BYTES,
} from "./policy";
import {
  attachmentObjectKeys,
  readAttachmentStorageConfig,
} from "./s3";

describe("attachment upload policy", () => {
  it("accepts supported files and normalizes the MIME type", () => {
    expect(
      attachmentUploadInputSchema.parse({
        fileName: " Отчёт.pdf ",
        contentType: "Application/PDF; charset=binary",
        sizeBytes: 42,
      })
    ).toEqual({
      fileName: "Отчёт.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
    });
  });

  it("rejects executable, empty and oversized files", () => {
    for (const input of [
      {
        fileName: "run.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 42,
      },
      {
        fileName: "empty.txt",
        contentType: "text/plain",
        sizeBytes: 0,
      },
      {
        fileName: "large.pdf",
        contentType: "application/pdf",
        sizeBytes: MAX_ATTACHMENT_BYTES + 1,
      },
    ]) {
      expect(attachmentUploadInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("keeps filenames out of private object keys", () => {
    const keys = attachmentObjectKeys({
      workspaceID: "00000000-0000-7000-8000-000000000010",
      issueID: "00000000-0000-7000-8000-000000000040",
      attachmentID: "00000000-0000-7000-8000-000000000070",
    });
    expect(keys.pending).toBe(
      "pending/workspaces/00000000-0000-7000-8000-000000000010/issues/00000000-0000-7000-8000-000000000040/00000000-0000-7000-8000-000000000070"
    );
    expect(keys.final).toBe(
      "attachments/workspaces/00000000-0000-7000-8000-000000000010/issues/00000000-0000-7000-8000-000000000040/00000000-0000-7000-8000-000000000070"
    );
    expect(JSON.stringify(keys)).not.toContain("report");
  });
});

describe("attachment storage configuration", () => {
  it("keeps credentials server-side and defaults to path-style requests", () => {
    expect(
      readAttachmentStorageConfig({
        S3_ENDPOINT: "https://s3.example.test",
        S3_REGION: "ru-1",
        S3_BUCKET: "pulsar-private",
        S3_ACCESS_KEY_ID: "access",
        S3_SECRET_ACCESS_KEY: "secret",
      })
    ).toEqual({
      endpoint: "https://s3.example.test",
      publicEndpoint: "https://s3.example.test",
      region: "ru-1",
      bucket: "pulsar-private",
      accessKeyID: "access",
      secretAccessKey: "secret",
      forcePathStyle: true,
    });
  });

  it("fails closed when storage configuration is missing", () => {
    expect(() => readAttachmentStorageConfig({})).toThrow(
      "Хранилище вложений не настроено"
    );
  });
});
