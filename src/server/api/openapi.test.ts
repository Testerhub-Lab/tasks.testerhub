import { describe, expect, it } from "vitest";
import { pulsarOpenApi } from "./openapi";

describe("Pulsar REST/OpenAPI contract", () => {
  it("documents every REST operation used by MCP", () => {
    expect(pulsarOpenApi.paths).toMatchObject({
      "/workspaces": { get: { operationId: "listWorkspaces" } },
      "/projects": {
        get: { operationId: "listProjects" },
        post: { operationId: "createProject" },
      },
      "/projects/{projectKey}/releases": {
        get: { operationId: "listReleases" },
        post: { operationId: "createRelease" },
      },
      "/projects/{projectKey}/releases/{releaseId}": {
        get: { operationId: "getRelease" },
        patch: { operationId: "updateRelease" },
      },
      "/projects/{projectKey}/releases/{releaseId}/issues": {
        post: { operationId: "addReleaseIssues" },
      },
      "/issues": {
        get: { operationId: "searchIssues" },
        post: { operationId: "createIssue" },
      },
      "/issues/{key}": {
        get: { operationId: "getIssue" },
        patch: { operationId: "updateIssue" },
      },
      "/issues/{key}/comments": {
        post: { operationId: "addComment" },
      },
      "/issues/{key}/attachments": {
        get: { operationId: "listIssueAttachments" },
        post: { operationId: "prepareIssueAttachmentUpload" },
      },
      "/issues/{key}/attachments/{attachmentId}/confirm": {
        post: { operationId: "confirmIssueAttachment" },
      },
      "/issues/{key}/attachments/{attachmentId}/download-url": {
        get: { operationId: "getIssueAttachmentDownloadUrl" },
      },
      "/projects/{projectKey}/wiki/pages": {
        get: { operationId: "listWikiPages" },
        post: { operationId: "createWikiPage" },
      },
      "/wiki/pages/{pageId}": {
        get: { operationId: "getWikiPage" },
        patch: { operationId: "updateWikiPage" },
      },
      "/issues/{key}/wiki-links": {
        post: { operationId: "linkIssueToWiki" },
      },
    });
  });

  it("keeps project keys and issue statuses aligned with the public API", () => {
    expect(pulsarOpenApi.components.schemas.ProjectKey).toMatchObject({
      maxLength: 10,
      pattern: "^[A-Z][A-Z0-9]{1,9}$",
    });
    expect(
      pulsarOpenApi.components.schemas.UpdateIssue.properties.status.enum
    ).toEqual([
      "NEW",
      "TODO",
      "HOLD",
      "IN_PROGRESS",
      "TESTING",
      "DONE",
      "REJECT",
    ]);
  });

  it("requires idempotency keys for every create operation", () => {
    const operations = [
      pulsarOpenApi.paths["/projects"].post,
      pulsarOpenApi.paths["/projects/{projectKey}/releases"].post,
      pulsarOpenApi.paths["/projects/{projectKey}/releases/{releaseId}/issues"].post,
      pulsarOpenApi.paths["/issues"].post,
      pulsarOpenApi.paths["/issues/{key}/comments"].post,
      pulsarOpenApi.paths[
        "/issues/{key}/attachments/{attachmentId}/confirm"
      ].post,
      pulsarOpenApi.paths["/projects/{projectKey}/wiki/pages"].post,
      pulsarOpenApi.paths["/issues/{key}/wiki-links"].post,
    ];
    for (const operation of operations) {
      expect(operation.parameters).toContainEqual({
        $ref: "#/components/parameters/IdempotencyKey",
      });
    }
  });
});
