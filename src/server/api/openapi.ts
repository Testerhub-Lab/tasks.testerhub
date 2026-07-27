const issueStatuses = [
  "NEW",
  "TODO",
  "HOLD",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "REJECT",
] as const;

const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const bearerSecurity = [{ bearerAuth: [] }];

const jsonBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: {
    "application/json": { schema },
  },
});

export const pulsarOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "Pulsar REST API",
    version: "1.0.0",
    description:
      "Stable REST boundary used by Pulsar MCP. Application writes share the authoritative Zero command and authorization layer.",
  },
  servers: [{ url: "/api/v1" }],
  security: bearerSecurity,
  paths: {
    "/workspaces": {
      get: {
        operationId: "listWorkspaces",
        responses: { "200": { description: "Accessible workspaces" } },
      },
    },
    "/projects": {
      get: {
        operationId: "listProjects",
        parameters: [
          {
            name: "workspaceId",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: { "200": { description: "Accessible projects" } },
      },
      post: {
        operationId: "createProject",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: jsonBody({ $ref: "#/components/schemas/CreateProject" }),
        responses: {
          "201": { description: "Created project" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/issues": {
      get: {
        operationId: "searchIssues",
        parameters: [
          {
            name: "projectKey",
            in: "query",
            schema: { $ref: "#/components/schemas/ProjectKey" },
          },
          { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "array",
              items: { enum: issueStatuses },
            },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: { "200": { description: "Accessible issues" } },
      },
      post: {
        operationId: "createIssue",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: jsonBody({ $ref: "#/components/schemas/CreateIssue" }),
        responses: {
          "201": { description: "Created issue" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/issues/{key}": {
      get: {
        operationId: "getIssue",
        parameters: [{ $ref: "#/components/parameters/IssueKey" }],
        responses: {
          "200": { description: "Issue with comments" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        operationId: "updateIssue",
        parameters: [{ $ref: "#/components/parameters/IssueKey" }],
        requestBody: jsonBody({ $ref: "#/components/schemas/UpdateIssue" }),
        responses: {
          "200": { description: "Updated issue" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/issues/{key}/comments": {
      post: {
        operationId: "addComment",
        parameters: [
          { $ref: "#/components/parameters/IssueKey" },
          { $ref: "#/components/parameters/IdempotencyKey" },
        ],
        requestBody: jsonBody({ $ref: "#/components/schemas/AddComment" }),
        responses: {
          "201": { description: "Created comment" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
    parameters: {
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
      },
      IssueKey: {
        name: "key",
        in: "path",
        required: true,
        schema: {
          type: "string",
          pattern: "^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$",
        },
      },
    },
    schemas: {
      ProjectKey: {
        type: "string",
        minLength: 2,
        maxLength: 10,
        pattern: "^[A-Z][A-Z0-9]{1,9}$",
      },
      CreateProject: {
        type: "object",
        additionalProperties: false,
        required: ["workspaceId", "key", "name"],
        properties: {
          workspaceId: { type: "string", format: "uuid" },
          key: { $ref: "#/components/schemas/ProjectKey" },
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: {
            type: ["string", "null"],
            maxLength: 20000,
          },
        },
      },
      CreateIssue: {
        type: "object",
        additionalProperties: false,
        required: ["projectKey", "title"],
        properties: {
          projectKey: { $ref: "#/components/schemas/ProjectKey" },
          title: { type: "string", minLength: 3, maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 2000 },
          type: { type: "string", minLength: 1, maxLength: 40, default: "TASK" },
          priority: { enum: priorities, default: "MEDIUM" },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 40 },
            default: [],
          },
        },
      },
      UpdateIssue: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          title: { type: "string", minLength: 3, maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 2000 },
          status: { enum: issueStatuses },
          priority: { enum: priorities },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 40 },
          },
        },
      },
      AddComment: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: { type: "string", minLength: 1, maxLength: 2000 },
        },
      },
    },
    responses: {
      Forbidden: { description: "Authenticated actor lacks permission" },
      NotFound: { description: "Resource does not exist or is not visible" },
    },
  },
} as const;
