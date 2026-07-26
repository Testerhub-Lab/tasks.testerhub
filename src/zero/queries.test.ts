import {
  mustGetQuery,
  type AST,
  type ReadonlyJSONValue,
} from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { describe, expect, it } from "vitest";
import { zeroQueries } from "./queries";
import { zeroSchema } from "./schema";

const userA = "00000000-0000-7000-8000-000000000001";
const userB = "00000000-0000-7000-8000-000000000002";
const workspaceID = "00000000-0000-7000-8000-000000000010";
const workflowID = "00000000-0000-7000-8000-000000000020";
const projectID = "00000000-0000-7000-8000-000000000030";
const issueID = "00000000-0000-7000-8000-000000000040";

const requests = [
  { id: "workspaces", name: "workspaces.mine", args: [] },
  {
    id: "members",
    name: "members.byWorkspace",
    args: [{ workspaceID }],
  },
  {
    id: "workflows",
    name: "workflows.byWorkspace",
    args: [{ workspaceID }],
  },
  {
    id: "states",
    name: "workflowStates.byWorkflow",
    args: [{ workflowID }],
  },
  {
    id: "projects",
    name: "projects.byWorkspace",
    args: [{ workspaceID }],
  },
  {
    id: "issues-project",
    name: "issues.byProject",
    args: [{ projectID }],
  },
  { id: "issue", name: "issues.byID", args: [{ issueID }] },
  { id: "comments", name: "comments.byIssue", args: [{ issueID }] },
  {
    id: "tags",
    name: "tags.byWorkspace",
    args: [{ workspaceID }],
  },
  { id: "issue-tags", name: "issueTags.byIssue", args: [{ issueID }] },
  {
    id: "participants",
    name: "participants.byIssue",
    args: [{ issueID }],
  },
  {
    id: "attachments",
    name: "attachments.byIssue",
    args: [{ issueID }],
  },
] as const;

async function transformFor(userID: string) {
  return handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(zeroQueries, name);
      return query.fn({ args, ctx: { userID } });
    },
    schema: zeroSchema,
    query: {},
    body: ["transform", requests] as unknown as ReadonlyJSONValue,
    userID,
  });
}

type QueryResponseObject = {
  kind: "QueryResponse";
  queries: Array<
    | { id: string; name: string; ast: AST }
    | { id: string; name: string; error: string }
  >;
};

function asQueryResponse(result: unknown): QueryResponseObject {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !("kind" in result) ||
    result.kind !== "QueryResponse" ||
    !("queries" in result) ||
    !Array.isArray(result.queries)
  ) {
    throw new Error(`Unexpected query result: ${JSON.stringify(result)}`);
  }

  return result as QueryResponseObject;
}

function getASTs(result: unknown): AST[] {
  return asQueryResponse(result).queries.map((query) => {
    if (!("ast" in query)) {
      throw new Error(`Query was rejected: ${JSON.stringify(query)}`);
    }
    return query.ast;
  });
}

describe("Zero query permissions", () => {
  it("injects the authenticated user into every application query", async () => {
    const asts = getASTs(await transformFor(userA));
    expect(asts).toHaveLength(requests.length);

    for (const ast of asts) {
      const serialized = JSON.stringify(ast);
      expect(serialized).toContain(userA);
      expect(serialized).not.toContain(userB);
      expect(serialized).toContain("workspace_members");
    }
  });

  it("produces a different permission boundary for another user", async () => {
    const first = getASTs(await transformFor(userA));
    const second = getASTs(await transformFor(userB));

    for (let index = 0; index < first.length; index += 1) {
      expect(JSON.stringify(first[index])).not.toEqual(
        JSON.stringify(second[index])
      );
      expect(JSON.stringify(second[index])).toContain(userB);
      expect(JSON.stringify(second[index])).not.toContain(userA);
    }
  });

  it("rejects a direct query name that is not on the named-query allowlist", async () => {
    const result = await handleQueryRequest({
      handler: (name, args) => {
        const query = mustGetQuery(zeroQueries, name);
        return query.fn({ args, ctx: { userID: userA } });
      },
      schema: zeroSchema,
      query: {},
      body: [
        "transform",
        [{ id: "raw", name: "issues.raw", args: [{ workspaceID }] }],
      ] as ReadonlyJSONValue,
      userID: userA,
    });

    expect(asQueryResponse(result).queries[0]).toMatchObject({
      id: "raw",
      name: "issues.raw",
      error: "app",
    });
  });
});
