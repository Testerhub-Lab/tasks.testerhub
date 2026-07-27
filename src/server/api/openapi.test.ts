import { describe, expect, it } from "vitest";
import { pulsarOpenApi } from "./openapi";

describe("Pulsar REST/OpenAPI contract", () => {
  it("documents every projects/issues/comments operation used by MCP", () => {
    expect(pulsarOpenApi.paths).toMatchObject({
      "/workspaces": { get: { operationId: "listWorkspaces" } },
      "/projects": {
        get: { operationId: "listProjects" },
        post: { operationId: "createProject" },
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
      pulsarOpenApi.paths["/issues"].post,
      pulsarOpenApi.paths["/issues/{key}/comments"].post,
    ];
    for (const operation of operations) {
      expect(operation.parameters).toContainEqual({
        $ref: "#/components/parameters/IdempotencyKey",
      });
    }
  });
});
