import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import prisma from "../src/lib/prisma";
import { generateApiToken } from "../src/server/api/tokens";
import { getZeroDatabase } from "../src/zero/db";
import { zeroMutators } from "../src/zero/mutators";
import { DEFAULT_WORKFLOW_STATES } from "../src/zero/stage3";

const baseURL = process.env.STAGE4_BASE_URL ?? "http://localhost:3000";

type ApiEnvelope<T> = { data: T };

async function api<T>(
  token: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    idempotencyKey?: string;
    expectedStatus?: number;
  } = {}
): Promise<T> {
  const response = await fetch(`${baseURL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json()) as ApiEnvelope<T> | {
    error?: { code?: string; message?: string };
  };
  const expected = options.expectedStatus ?? 200;
  if (response.status !== expected) {
    throw new Error(
      `${options.method ?? "GET"} ${path}: expected ${expected}, got ${
        response.status
      } ${JSON.stringify(payload)}`
    );
  }
  return ("data" in payload ? payload.data : payload) as T;
}

async function createActor(label: string) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `${label}-${suffix}@stage4.invalid`,
      name: `Stage 4 ${label}`,
    },
    select: { id: true, email: true, name: true },
  });
  const generated = generateApiToken();
  const apiToken = await prisma.apiToken.create({
    data: {
      userId: user.id,
      name: `stage4-${label}`,
      tokenPrefix: generated.tokenPrefix,
      tokenHash: generated.tokenHash,
      scopes: [
        "projects:read",
        "projects:write",
        "issues:read",
        "issues:write",
        "wiki:read",
        "wiki:write",
      ],
    },
    select: { id: true },
  });

  const workspaceID = randomUUID();
  const workflowID = randomUUID();
  await getZeroDatabase().transaction((tx) =>
    zeroMutators.workspaces.create.fn({
      args: {
        id: workspaceID,
        name: `Stage 4 ${label}`,
        slug: `stage-4-${label.toLowerCase()}-${suffix.slice(0, 8)}`,
        displayName: user.name ?? label,
        workflowID,
        workflowName: "Default",
        workflowStates: DEFAULT_WORKFLOW_STATES.map((state) => ({
          ...state,
          id: randomUUID(),
        })),
      },
      ctx: { userID: user.id },
      tx,
    })
  );

  return {
    ...user,
    token: generated.plainToken,
    tokenID: apiToken.id,
    workspaceID,
  };
}

async function checkMcp(
  token: string,
  projectKey: string,
  issueKey: string,
  pageID: string
) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["packages/pulsar-mcp/dist/index.js"],
    env: {
      PATH: process.env.PATH ?? "",
      PULSAR_API_TOKEN: token,
      PULSAR_BASE_URL: baseURL,
    },
    stderr: "pipe",
  });
  const client = new Client({
    name: "pulsar-stage4-check",
    version: "1.0.0",
  });
  await client.connect(transport);
  try {
    const parseText = <T>(toolResult: unknown) => {
      if (
        !toolResult ||
        typeof toolResult !== "object" ||
        !("content" in toolResult) ||
        !Array.isArray(toolResult.content)
      ) {
        throw new Error("MCP tool returned no content");
      }
      if ("isError" in toolResult && toolResult.isError) {
        throw new Error("MCP tool returned an error");
      }
      const content = toolResult.content as Array<{
        type: string;
        text?: string;
      }>;
      const block = content.find((item) => item.type === "text");
      if (!block?.text) {
        throw new Error("MCP tool returned no text result");
      }
      return JSON.parse(block.text) as T;
    };
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === "create_project")) {
      throw new Error("MCP create_project is not registered");
    }
    for (const name of [
      "list_wiki_pages",
      "get_wiki_page",
      "create_wiki_page",
      "update_wiki_page",
      "link_issue_to_wiki",
    ]) {
      if (!tools.tools.some((tool) => tool.name === name)) {
        throw new Error(`MCP ${name} is not registered`);
      }
    }
    const result = await client.callTool({
      name: "get_issue",
      arguments: { key: issueKey },
    });
    const issue = parseText<{ key?: string }>(result);
    if (issue.key !== issueKey) {
      throw new Error("MCP get_issue returned a different issue");
    }
    const pageResult = await client.callTool({
      name: "get_wiki_page",
      arguments: { pageId: pageID },
    });
    const page = parseText<{ id?: string }>(pageResult);
    if (page.id !== pageID) {
      throw new Error("MCP get_wiki_page returned a different page");
    }
    const listResult = await client.callTool({
      name: "list_wiki_pages",
      arguments: { projectKey },
    });
    parseText(listResult);

    const createdResult = await client.callTool({
      name: "create_wiki_page",
      arguments: {
        projectKey,
        parentId: pageID,
        title: "MCP Wiki child",
        contentMarkdown: "Created through MCP",
      },
    });
    const created = parseText<{ id: string; version: number }>(createdResult);
    const updatedResult = await client.callTool({
      name: "update_wiki_page",
      arguments: {
        pageId: created.id,
        title: "MCP Wiki child updated",
        expectedVersion: created.version,
      },
    });
    const updated = parseText<{ version: number }>(updatedResult);
    if (updated.version !== 2) {
      throw new Error("MCP update_wiki_page did not create version 2");
    }
    const linkResult = await client.callTool({
      name: "link_issue_to_wiki",
      arguments: { issueKey, pageId: created.id },
    });
    parseText(linkResult);
    const linkedIssueResult = await client.callTool({
      name: "get_issue",
      arguments: { key: issueKey },
    });
    const linkedIssue = parseText<{
      knowledgeLinks?: Array<{ documentKey?: string }>;
    }>(linkedIssueResult);
    if (
      !linkedIssue.knowledgeLinks?.some(
        (link) => link.documentKey === created.id
      )
    ) {
      throw new Error("MCP Wiki link is missing from get_issue");
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const owner = await createActor("Owner");
  const viewer = await createActor("Viewer");
  const now = Date.now();
  await getZeroDatabase().transaction((tx) =>
    tx.mutate.workspaceMember.insert({
      workspaceID: owner.workspaceID,
      userID: viewer.id,
      role: "VIEWER",
      createdAt: now,
      updatedAt: now,
    })
  );

  const openapi = await fetch(`${baseURL}/api/v1/openapi`);
  if (!openapi.ok) throw new Error(`OpenAPI returned ${openapi.status}`);

  const workspaces = await api<Array<{ id: string }>>(
    owner.token,
    "/api/v1/workspaces"
  );
  if (!workspaces.some((workspace) => workspace.id === owner.workspaceID)) {
    throw new Error("Owner workspace is missing from REST");
  }

  const projectKey =
    `S4${randomUUID().replaceAll("-", "").slice(0, 6)}`.toUpperCase();
  const projectBody = {
    workspaceId: owner.workspaceID,
    key: projectKey,
    name: "Stage 4 API",
    description: "REST and Zero share commands",
  };
  const project = await api<{ id: string; key: string }>(
    owner.token,
    "/api/v1/projects",
    {
      method: "POST",
      body: projectBody,
      idempotencyKey: "stage4-project",
      expectedStatus: 201,
    }
  );
  const projectReplay = await api<{ id: string; key: string }>(
    owner.token,
    "/api/v1/projects",
    {
      method: "POST",
      body: projectBody,
      idempotencyKey: "stage4-project",
      expectedStatus: 201,
    }
  );
  if (project.id !== projectReplay.id) {
    throw new Error("Project idempotency replay changed the resource");
  }
  await getZeroDatabase().transaction((tx) =>
    tx.mutate.project.update({
      id: project.id,
      knowledgeProvider: "NATIVE",
      knowledgeExternalURL: null,
      updatedAt: Date.now(),
    })
  );

  const issue = await api<{ id: string; key: string; type: string }>(
    owner.token,
    "/api/v1/issues",
    {
      method: "POST",
      body: {
        projectKey,
        title: "Exercise shared command",
        description: "Created through REST, stored in the Zero schema",
        type: "TASK",
        priority: "HIGH",
        tags: ["contract", "zero"],
      },
      idempotencyKey: "stage4-issue",
      expectedStatus: 201,
    }
  );
  if (issue.type !== "TASK") throw new Error("Issue type was not persisted");

  const updated = await api<{
    status: string;
    priority: string;
    tags: string[];
  }>(owner.token, `/api/v1/issues/${issue.key}`, {
    method: "PATCH",
    body: {
      status: "IN_PROGRESS",
      priority: "CRITICAL",
      tags: ["contract", "mcp"],
    },
  });
  if (
    updated.status !== "IN_PROGRESS" ||
    updated.priority !== "CRITICAL" ||
    [...updated.tags].sort().join(",") !== "contract,mcp"
  ) {
    throw new Error(`Issue update mismatch: ${JSON.stringify(updated)}`);
  }

  await api(owner.token, `/api/v1/issues/${issue.key}/comments`, {
    method: "POST",
    body: { text: "Comment through the shared command" },
    idempotencyKey: "stage4-comment",
    expectedStatus: 201,
  });
  const detail = await api<{ comments: Array<{ text: string }> }>(
    owner.token,
    `/api/v1/issues/${issue.key}`
  );
  if (detail.comments[0]?.text !== "Comment through the shared command") {
    throw new Error("REST comment is missing from the Zero query");
  }

  const search = await api<Array<{ key: string }>>(
    owner.token,
    `/api/v1/issues?projectKey=${projectKey}&status=IN_PROGRESS&q=shared`
  );
  if (search[0]?.key !== issue.key) {
    throw new Error("REST issue search did not return the updated issue");
  }

  const wikiBody = {
    title: "Stage 4 Wiki",
    contentMarkdown: "# REST and MCP\n\nShared Wiki domain.",
  };
  const page = await api<{ id: string; version: number }>(
    owner.token,
    `/api/v1/projects/${projectKey}/wiki/pages`,
    {
      method: "POST",
      body: wikiBody,
      idempotencyKey: "stage4-wiki-page",
      expectedStatus: 201,
    }
  );
  const pageReplay = await api<{ id: string }>(
    owner.token,
    `/api/v1/projects/${projectKey}/wiki/pages`,
    {
      method: "POST",
      body: wikiBody,
      idempotencyKey: "stage4-wiki-page",
      expectedStatus: 201,
    }
  );
  if (page.id !== pageReplay.id) {
    throw new Error("Wiki idempotency replay changed the page");
  }
  const updatedPage = await api<{ version: number; title: string }>(
    owner.token,
    `/api/v1/wiki/pages/${page.id}`,
    {
      method: "PATCH",
      body: {
        title: "Stage 4 Wiki updated",
        expectedVersion: page.version,
      },
    }
  );
  if (updatedPage.version !== 2) {
    throw new Error("Wiki update did not create version 2");
  }
  await api(owner.token, `/api/v1/wiki/pages/${page.id}`, {
    method: "PATCH",
    body: { title: "Stale update", expectedVersion: 1 },
    expectedStatus: 409,
  });
  await api(owner.token, `/api/v1/issues/${issue.key}/wiki-links`, {
    method: "POST",
    body: { pageId: page.id },
    idempotencyKey: "stage4-wiki-link",
    expectedStatus: 201,
  });
  const wikiList = await api<{ pages: Array<{ id: string }> }>(
    owner.token,
    `/api/v1/projects/${projectKey}/wiki/pages`
  );
  if (!wikiList.pages.some((candidate) => candidate.id === page.id)) {
    throw new Error("Wiki page is missing from the new domain query");
  }
  const linkedIssue = await api<{
    knowledgeLinks: Array<{ documentKey: string; title: string }>;
  }>(owner.token, `/api/v1/issues/${issue.key}`);
  if (
    linkedIssue.knowledgeLinks[0]?.documentKey !== page.id ||
    linkedIssue.knowledgeLinks[0]?.title !== updatedPage.title
  ) {
    throw new Error("Issue response is missing the new Wiki link");
  }
  await checkMcp(owner.token, projectKey, issue.key, page.id);

  await api(viewer.token, `/api/v1/issues/${issue.key}`, {
    method: "PATCH",
    body: { title: "Forbidden viewer update" },
    expectedStatus: 403,
  });
  await api(viewer.token, `/api/v1/issues/${issue.key}/comments`, {
    method: "POST",
    body: { text: "Forbidden viewer comment" },
    idempotencyKey: "stage4-viewer-comment",
    expectedStatus: 403,
  });
  await api(viewer.token, `/api/v1/wiki/pages/${page.id}`, {
    method: "PATCH",
    body: { title: "Forbidden viewer Wiki update" },
    expectedStatus: 403,
  });
  await api(viewer.token, `/api/v1/issues/${issue.key}/wiki-links`, {
    method: "POST",
    body: { pageId: page.id },
    idempotencyKey: "stage4-viewer-wiki-link",
    expectedStatus: 403,
  });

  const unchanged = await api<{ title: string; comments: unknown[] }>(
    owner.token,
    `/api/v1/issues/${issue.key}`
  );
  if (
    unchanged.title !== "Exercise shared command" ||
    unchanged.comments.length !== 1
  ) {
    throw new Error("Rejected REST mutation changed the issue");
  }
  const auditCount = await prisma.apiAuditLog.count({
    where: { apiTokenId: owner.tokenID },
  });
  if (auditCount !== 10) {
    throw new Error(`Expected 10 API audit records, got ${auditCount}`);
  }

  console.log(
    JSON.stringify({
      apiAudit: true,
      commentVisible: true,
      idempotencyReplay: true,
      issueSearch: true,
      mcpGetIssue: true,
      mcpGetWikiPage: true,
      mcpWikiWriteRoundTrip: true,
      mcpToolRegistered: true,
      openapi: true,
      rejectedMutationUnchanged: true,
      viewerMutationDenied: true,
      wikiIdempotencyReplay: true,
      wikiLinkVisible: true,
      wikiVersionConflict: true,
    })
  );
}

void main().finally(() => prisma.$disconnect());
