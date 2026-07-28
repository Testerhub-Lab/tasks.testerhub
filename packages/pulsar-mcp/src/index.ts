import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import {
  createPulsarClientFromEnv,
  PulsarApiError,
} from "./client.js";
import { resourceIDSchema } from "./schemas.js";

const client = createPulsarClientFromEnv();

function result(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown): CallToolResult {
  const message =
    error instanceof PulsarApiError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

async function runTool(operation: () => Promise<unknown>) {
  try {
    return result(await operation());
  } catch (error) {
    return errorResult(error);
  }
}

const server = new McpServer(
  {
    name: "pulsar",
    version: "0.1.0",
  },
  {
    instructions:
      "Use project keys such as PULSAR or LMS. Search before creating issues. " +
      "Use Wiki for durable decisions and issues for actionable work. " +
      "Do not change status or content outside the requested project.",
  }
);

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

server.registerTool(
  "list_workspaces",
  {
    title: "List Pulsar workspaces",
    description:
      "List every Pulsar workspace available to the authenticated user.",
    inputSchema: z.object({}),
    annotations: readAnnotations,
  },
  () => runTool(() => client.request("/api/v1/workspaces"))
);

server.registerTool(
  "list_projects",
  {
    title: "List Pulsar projects",
    description:
      "List every Pulsar project available to the authenticated user, including the user's project role and Wiki provider.",
    inputSchema: z.object({
      workspaceId: z.string().optional(),
    }),
    annotations: readAnnotations,
  },
  ({ workspaceId }) =>
    runTool(() =>
      client.request(
        `/api/v1/projects${
          workspaceId
            ? `?workspaceId=${encodeURIComponent(workspaceId)}`
            : ""
        }`
      )
    )
);

server.registerTool(
  "create_project",
  {
    title: "Create a Pulsar project",
    description:
      "Create a project in a workspace using its default workflow.",
    inputSchema: z.object({
      workspaceId: resourceIDSchema,
      key: z
        .string()
        .min(2)
        .max(10)
        .regex(/^[A-Z][A-Z0-9]{1,9}$/),
      name: z.string().min(1).max(120),
      description: z.string().max(20_000).nullable().optional(),
    }),
    annotations: writeAnnotations,
  },
  (input) =>
    runTool(() =>
      client.request("/api/v1/projects", {
        method: "POST",
        body: input,
        idempotentCreate: true,
      })
    )
);

server.registerTool(
  "search_issues",
  {
    title: "Search Pulsar issues",
    description:
      "Search issues in one project or across every accessible project. Use this before create_issue to avoid duplicates.",
    inputSchema: z.object({
      projectKey: z.string().min(2).max(10).optional(),
      query: z.string().max(200).optional(),
      statuses: z
        .array(
          z.enum([
            "NEW",
            "TODO",
            "HOLD",
            "IN_PROGRESS",
            "TESTING",
            "DONE",
            "REJECT",
          ])
        )
        .optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    annotations: readAnnotations,
  },
  ({ projectKey, query, statuses, limit }) =>
    runTool(() => {
      const params = new URLSearchParams();
      if (projectKey) params.set("projectKey", projectKey);
      if (query) params.set("q", query);
      for (const status of statuses ?? []) params.append("status", status);
      params.set("limit", String(limit));
      return client.request(`/api/v1/issues?${params.toString()}`);
    })
);

server.registerTool(
  "get_issue",
  {
    title: "Get a Pulsar issue",
    description:
      "Read one issue with comments, activity and linked Wiki documents.",
    inputSchema: z.object({
      key: z.string().min(3).describe("Issue key, for example PULSAR-2"),
    }),
    annotations: readAnnotations,
  },
  ({ key }) =>
    runTool(() =>
      client.request(`/api/v1/issues/${encodeURIComponent(key)}`)
    )
);

server.registerTool(
  "create_issue",
  {
    title: "Create a Pulsar issue",
    description:
      "Create a new issue in a project. Search for duplicates first and use Wiki for durable context.",
    inputSchema: z.object({
      projectKey: z.string().min(2).max(10),
      title: z.string().min(3).max(120),
      description: z.string().max(2000).optional(),
      type: z.string().min(1).max(40).default("TASK"),
      priority: z
        .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .default("MEDIUM"),
      tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    }),
    annotations: writeAnnotations,
  },
  (input) =>
    runTool(() =>
      client.request("/api/v1/issues", {
        method: "POST",
        body: input,
        idempotentCreate: true,
      })
    )
);

server.registerTool(
  "update_issue",
  {
    title: "Update a Pulsar issue",
    description:
      "Update issue fields. Change status only when the user explicitly asks for it.",
    inputSchema: z.object({
      key: z.string().min(3),
      title: z.string().min(3).max(120).optional(),
      description: z.string().max(2000).nullable().optional(),
      status: z
        .enum([
          "NEW",
          "TODO",
          "HOLD",
          "IN_PROGRESS",
          "TESTING",
          "DONE",
          "REJECT",
        ])
        .optional(),
      priority: z
        .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .optional(),
      tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    }),
    annotations: writeAnnotations,
  },
  ({ key, ...body }) =>
    runTool(() =>
      client.request(`/api/v1/issues/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body,
      })
    )
);

server.registerTool(
  "add_comment",
  {
    title: "Add a Pulsar issue comment",
    description: "Add a comment to an existing Pulsar issue.",
    inputSchema: z.object({
      key: z.string().min(3),
      text: z.string().min(1).max(2000),
    }),
    annotations: writeAnnotations,
  },
  ({ key, text }) =>
    runTool(() =>
      client.request(
        `/api/v1/issues/${encodeURIComponent(key)}/comments`,
        {
          method: "POST",
          body: { text },
          idempotentCreate: true,
        }
      )
    )
);

server.registerTool(
  "list_wiki_pages",
  {
    title: "List Pulsar Wiki pages",
    description:
      "List the Wiki page tree and provider configuration for one project.",
    inputSchema: z.object({
      projectKey: z.string().min(2).max(10),
    }),
    annotations: readAnnotations,
  },
  ({ projectKey }) =>
    runTool(() =>
      client.request(
        `/api/v1/projects/${encodeURIComponent(projectKey)}/wiki/pages`
      )
    )
);

server.registerTool(
  "search_wiki",
  {
    title: "Search Pulsar Wiki",
    description:
      "Search Wiki page titles and Markdown content in one project.",
    inputSchema: z.object({
      projectKey: z.string().min(2).max(10),
      query: z.string().min(1).max(200),
    }),
    annotations: readAnnotations,
  },
  ({ projectKey, query }) =>
    runTool(() =>
      client.request(
        `/api/v1/projects/${encodeURIComponent(
          projectKey
        )}/wiki/pages?q=${encodeURIComponent(query)}`
      )
    )
);

server.registerTool(
  "get_wiki_page",
  {
    title: "Get a Pulsar Wiki page",
    description:
      "Read one Wiki page with Markdown, version metadata and revision history.",
    inputSchema: z.object({
      pageId: resourceIDSchema,
    }),
    annotations: readAnnotations,
  },
  ({ pageId }) =>
    runTool(() =>
      client.request(`/api/v1/wiki/pages/${encodeURIComponent(pageId)}`)
    )
);

server.registerTool(
  "create_wiki_page",
  {
    title: "Create a Pulsar Wiki page",
    description:
      "Create a versioned Markdown page in a project's native Wiki.",
    inputSchema: z.object({
      projectKey: z.string().min(2).max(10),
      title: z.string().min(1).max(160),
      contentMarkdown: z.string().max(200_000).default(""),
      parentId: resourceIDSchema.nullable().optional(),
    }),
    annotations: writeAnnotations,
  },
  ({ projectKey, ...body }) =>
    runTool(() =>
      client.request(
        `/api/v1/projects/${encodeURIComponent(projectKey)}/wiki/pages`,
        {
          method: "POST",
          body,
          idempotentCreate: true,
        }
      )
    )
);

server.registerTool(
  "update_wiki_page",
  {
    title: "Update a Pulsar Wiki page",
    description:
      "Update Markdown or title and create a new revision. Pass expectedVersion after reading the page to prevent overwrites.",
    inputSchema: z.object({
      pageId: resourceIDSchema,
      title: z.string().min(1).max(160).optional(),
      contentMarkdown: z.string().max(200_000).optional(),
      expectedVersion: z.number().int().positive().optional(),
    }),
    annotations: writeAnnotations,
  },
  ({ pageId, ...body }) =>
    runTool(() =>
      client.request(`/api/v1/wiki/pages/${encodeURIComponent(pageId)}`, {
        method: "PATCH",
        body,
      })
    )
);

server.registerTool(
  "link_issue_to_wiki",
  {
    title: "Link a Pulsar issue to Wiki",
    description:
      "Attach a native Wiki page to an issue in the same project.",
    inputSchema: z.object({
      issueKey: z.string().min(3),
      pageId: resourceIDSchema,
    }),
    annotations: {
      ...writeAnnotations,
      idempotentHint: true,
    },
  },
  ({ issueKey, pageId }) =>
    runTool(() =>
      client.request(
        `/api/v1/issues/${encodeURIComponent(issueKey)}/wiki-links`,
        {
          method: "POST",
          body: { pageId },
          idempotentCreate: true,
        }
      )
    )
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
