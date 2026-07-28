import { createHash, randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import prisma from "../src/lib/prisma";
import {
  attachmentObjectKeys,
  readAttachmentStorageConfig,
} from "../src/server/attachments/s3";
import { createApiTokenRecord } from "../src/server/api/token-store";
import { generateApiToken } from "../src/server/api/tokens";
import { getZeroDatabase, getZeroPool } from "../src/zero/db";
import { DEFAULT_WORKFLOW_STATES } from "../src/zero/stage3";

const baseURL = process.env.STAGE4_BASE_URL ?? "http://localhost:3000";
const storageConfig = readAttachmentStorageConfig();
const s3 = new S3Client({
  endpoint: storageConfig.endpoint,
  region: storageConfig.region,
  forcePathStyle: storageConfig.forcePathStyle,
  credentials: {
    accessKeyId: storageConfig.accessKeyID,
    secretAccessKey: storageConfig.secretAccessKey,
  },
});

type ApiEnvelope<T> = { data: T };

async function ensureAttachmentBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: storageConfig.bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: storageConfig.bucket }));
  }
}

async function expectObjectMissing(key: string) {
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: storageConfig.bucket, Key: key })
    );
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "$metadata" in error &&
      error.$metadata &&
      typeof error.$metadata === "object" &&
      "httpStatusCode" in error.$metadata
        ? error.$metadata.httpStatusCode
        : undefined;
    if (status === 404) return;
    throw error;
  }
  throw new Error(`Expected S3 object to be absent: ${key}`);
}

async function putPresigned(
  intent: { uploadUrl: string; headers: Record<string, string> },
  content: Uint8Array<ArrayBuffer>
) {
  const response = await fetch(intent.uploadUrl, {
    method: "PUT",
    headers: intent.headers,
    body: content,
  });
  if (!response.ok) {
    throw new Error(
      `Presigned PUT returned ${response.status}: ${await response.text()}`
    );
  }
}

async function api<T>(
  token: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    idempotencyKey?: string;
    requestId?: string;
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
      ...(options.requestId
        ? { "X-Request-Id": options.requestId }
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

function responseCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

function cookieValue(cookieHeader: string, name: string) {
  for (const pair of cookieHeader.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

async function authRequest(
  path: string,
  input: {
    body?: unknown;
    cookie?: string;
    expectedStatus?: number;
  } = {}
) {
  const response = await fetch(`${baseURL}${path}`, {
    method: input.body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...(input.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(input.cookie ? { Cookie: input.cookie } : {}),
    },
    body:
      input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    user?: { id?: string; email?: string; name?: string | null };
  };
  const expectedStatus = input.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path}: expected ${expectedStatus}, got ${response.status} ${JSON.stringify(
        payload
      )}`
    );
  }
  return { response, payload };
}

async function registerActor(label: string) {
  const suffix = randomUUID();
  const email = `${label}-${suffix}@stage4.invalid`.toLowerCase();
  const password = `Stage4-${suffix}`;
  const name = `Stage 4 ${label}`;
  const registered = await authRequest("/api/auth/register", {
    body: { email, password, name },
  });
  const registeredCookies = responseCookies(registered.response);
  const workspaceID = cookieValue(registeredCookies, "th_workspace");
  const registeredToken = cookieValue(registeredCookies, "th_session");
  if (!workspaceID || !registeredToken) {
    throw new Error("Register did not return session and workspace cookies");
  }

  const me = await authRequest("/api/auth/me", {
    cookie: registeredCookies,
  });
  if (me.payload.user?.email !== email || !me.payload.user.id) {
    throw new Error("Registered Zero session did not resolve the actor");
  }
  const userID = me.payload.user.id;

  await authRequest("/api/auth/register", {
    body: { email, password, name },
    expectedStatus: 409,
  });
  await authRequest("/api/auth/login", {
    body: { email, password: `${password}-wrong` },
    expectedStatus: 401,
  });

  await authRequest("/api/auth/logout", {
    body: {},
    cookie: registeredCookies,
  });
  await authRequest("/api/auth/me", {
    cookie: registeredCookies,
    expectedStatus: 401,
  });

  const loggedIn = await authRequest("/api/auth/login", {
    body: { email, password },
  });
  const loginCookies = responseCookies(loggedIn.response);
  const loginToken = cookieValue(loginCookies, "th_session");
  if (!loginToken || cookieValue(loginCookies, "th_workspace") !== workspaceID) {
    throw new Error("Login did not restore the Zero workspace cookie");
  }

  await getZeroPool().query(
    `UPDATE sessions
     SET expires_at = now() - interval '1 second'
     WHERE token_hash = $1`,
    [createHash("sha256").update(loginToken).digest("hex")]
  );
  await authRequest("/api/auth/me", {
    cookie: loginCookies,
    expectedStatus: 401,
  });

  const activeLogin = await authRequest("/api/auth/login", {
    body: { email, password },
  });
  const activeCookies = responseCookies(activeLogin.response);
  if (!cookieValue(activeCookies, "th_session")) {
    throw new Error("Final login did not create an active session");
  }

  const authRows = await getZeroPool().query<{
    identities: string;
    workspaces: string;
    workflows: string;
    states: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM auth_identities
        WHERE user_id = $1 AND provider = 'password') AS identities,
       (SELECT count(*)::text FROM workspace_members
        WHERE user_id = $1 AND role = 'OWNER') AS workspaces,
       (SELECT count(*)::text FROM workflows
        WHERE workspace_id = $2 AND is_default) AS workflows,
       (SELECT count(*)::text FROM workflow_states
        WHERE workspace_id = $2) AS states`,
    [userID, workspaceID]
  );
  const auth = authRows.rows[0];
  if (
    auth?.identities !== "1" ||
    auth.workspaces !== "1" ||
    auth.workflows !== "1" ||
    Number(auth.states) !== DEFAULT_WORKFLOW_STATES.length
  ) {
    throw new Error(`Zero auth bootstrap mismatch: ${JSON.stringify(auth)}`);
  }

  return {
    id: userID,
    email,
    name,
    workspaceID,
    cookie: activeCookies,
  };
}

async function createActor(label: string) {
  const user = await registerActor(label);
  const generated = generateApiToken();

  const apiToken = await createApiTokenRecord({
    userID: user.id,
    displayName: user.name,
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
    expiresAt: null,
  });

  return {
    ...user,
    token: generated.plainToken,
    tokenID: apiToken.id,
  };
}

async function checkMcp(
  token: string,
  projectKey: string,
  issueKey: string,
  pageID: string,
  attachmentID: string
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
    const issue = parseText<{
      key?: string;
      attachments?: Array<{ id?: string }>;
    }>(result);
    if (
      issue.key !== issueKey ||
      !issue.attachments?.some(
        (attachment) => attachment.id === attachmentID
      )
    ) {
      throw new Error("MCP get_issue did not return the expected attachment");
    }
    const searchResult = await client.callTool({
      name: "search_issues",
      arguments: {
        projectKey,
        query: "exercise command",
        statuses: ["IN_PROGRESS"],
      },
    });
    const search = parseText<Array<{ key?: string }>>(searchResult);
    if (search[0]?.key !== issueKey) {
      throw new Error("MCP search_issues did not return the expected issue");
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
  await ensureAttachmentBucket();
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

  const attachmentContent = new TextEncoder().encode(
    "Pulsar private attachment"
  );
  const uploadIntent = await api<{
    attachmentId: string;
    uploadUrl: string;
    expiresAt: string;
    headers: Record<string, string>;
  }>(owner.token, `/api/v1/issues/${issue.key}/attachments`, {
    method: "POST",
    body: {
      fileName: "evidence.txt",
      contentType: "text/plain",
      sizeBytes: attachmentContent.byteLength,
    },
    expectedStatus: 201,
  });
  if (new Date(uploadIntent.expiresAt).getTime() <= Date.now()) {
    throw new Error("Attachment upload URL is already expired");
  }
  await api(viewer.token, `/api/v1/issues/${issue.key}/attachments`, {
    method: "POST",
    body: {
      fileName: "viewer.txt",
      contentType: "text/plain",
      sizeBytes: 1,
    },
    expectedStatus: 403,
  });
  await putPresigned(uploadIntent, attachmentContent);
  const attachment = await api<{
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }>(
    owner.token,
    `/api/v1/issues/${issue.key}/attachments/${uploadIntent.attachmentId}/confirm`,
    {
      method: "POST",
      idempotencyKey: "stage4-attachment-confirm",
      expectedStatus: 201,
    }
  );
  const attachmentReplay = await api<{ id: string }>(
    owner.token,
    `/api/v1/issues/${issue.key}/attachments/${uploadIntent.attachmentId}/confirm`,
    {
      method: "POST",
      idempotencyKey: "stage4-attachment-confirm",
      expectedStatus: 201,
    }
  );
  if (
    attachment.id !== attachmentReplay.id ||
    attachment.fileName !== "evidence.txt" ||
    attachment.contentType !== "text/plain" ||
    attachment.sizeBytes !== attachmentContent.byteLength
  ) {
    throw new Error("Attachment confirmation metadata mismatch");
  }
  const attachmentList = await api<Array<{ id: string }>>(
    owner.token,
    `/api/v1/issues/${issue.key}/attachments`
  );
  if (attachmentList.length !== 1 || attachmentList[0]?.id !== attachment.id) {
    throw new Error("Confirmed attachment is missing from REST list");
  }
  const detailWithAttachment = await api<{
    attachments: Array<{ id: string }>;
  }>(owner.token, `/api/v1/issues/${issue.key}`);
  if (
    detailWithAttachment.attachments.length !== 1 ||
    detailWithAttachment.attachments[0]?.id !== attachment.id
  ) {
    throw new Error("Confirmed attachment is missing from issue detail");
  }
  const download = await api<{
    attachment: { id: string };
    downloadUrl: string;
    expiresAt: string;
  }>(
    owner.token,
    `/api/v1/issues/${issue.key}/attachments/${attachment.id}/download-url`
  );
  const downloaded = await fetch(download.downloadUrl);
  if (
    !downloaded.ok ||
    Buffer.compare(
      Buffer.from(await downloaded.arrayBuffer()),
      Buffer.from(attachmentContent)
    ) !== 0
  ) {
    throw new Error("Presigned attachment download content mismatch");
  }
  const storedAttachment = await getZeroPool().query<{
    object_key: string;
  }>(
    `SELECT object_key
     FROM attachments
     WHERE id = $1 AND issue_id = $2`,
    [attachment.id, issue.id]
  );
  const objectKey = storedAttachment.rows[0]?.object_key;
  if (!objectKey?.startsWith("attachments/workspaces/")) {
    throw new Error("Attachment object key was not stored in the new domain");
  }
  const directURL =
    `${storageConfig.endpoint.replace(/\/$/, "")}/` +
    `${encodeURIComponent(storageConfig.bucket)}/${objectKey}`;
  const unsignedObject = await fetch(directURL);
  if (unsignedObject.status !== 403) {
    throw new Error(
      `Private S3 object returned ${unsignedObject.status} without a signature`
    );
  }
  const attachmentKeys = attachmentObjectKeys({
    workspaceID: owner.workspaceID,
    issueID: issue.id,
    attachmentID: attachment.id,
  });
  await expectObjectMissing(attachmentKeys.pending);

  const search = await api<Array<{ key: string }>>(
    owner.token,
    `/api/v1/issues?projectKey=${projectKey}&status=IN_PROGRESS&q=exercise%20command`
  );
  if (search[0]?.key !== issue.key) {
    throw new Error("REST issue search did not return the updated issue");
  }
  const wrongStatusSearch = await api<Array<{ key: string }>>(
    owner.token,
    `/api/v1/issues?projectKey=${projectKey}&status=DONE&q=${issue.key}`
  );
  if (wrongStatusSearch.length !== 0) {
    throw new Error("REST issue search ignored the status filter");
  }

  const foreignProjectKey =
    `F4${randomUUID().replaceAll("-", "").slice(0, 6)}`.toUpperCase();
  const foreignNeedle = `foreign-${randomUUID().slice(0, 8)}`;
  await api(viewer.token, "/api/v1/projects", {
    method: "POST",
    body: {
      workspaceId: viewer.workspaceID,
      key: foreignProjectKey,
      name: "Foreign Stage 4 project",
    },
    idempotencyKey: "stage4-foreign-project",
    expectedStatus: 201,
  });
  const foreignIssue = await api<{ key: string }>(
    viewer.token,
    "/api/v1/issues",
    {
      method: "POST",
      body: {
        projectKey: foreignProjectKey,
        title: `Workspace-private ${foreignNeedle}`,
      },
      idempotencyKey: "stage4-foreign-issue",
      expectedStatus: 201,
    }
  );
  const foreignAsOwner = await api<Array<{ key: string }>>(
    owner.token,
    `/api/v1/issues?q=${foreignNeedle}`
  );
  if (foreignAsOwner.length !== 0) {
    throw new Error("REST issue search leaked a foreign workspace candidate");
  }
  const foreignAsViewer = await api<Array<{ key: string }>>(
    viewer.token,
    `/api/v1/issues?q=${foreignNeedle}`
  );
  if (foreignAsViewer[0]?.key !== foreignIssue.key) {
    throw new Error("REST issue search hid the caller's own workspace issue");
  }

  const foreignContent = new TextEncoder().encode("foreign workspace file");
  const foreignIntent = await api<{
    attachmentId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>(viewer.token, `/api/v1/issues/${foreignIssue.key}/attachments`, {
    method: "POST",
    body: {
      fileName: "foreign.txt",
      contentType: "text/plain",
      sizeBytes: foreignContent.byteLength,
    },
    expectedStatus: 201,
  });
  await putPresigned(foreignIntent, foreignContent);
  await api(
    viewer.token,
    `/api/v1/issues/${foreignIssue.key}/attachments/${foreignIntent.attachmentId}/confirm`,
    {
      method: "POST",
      idempotencyKey: "stage4-foreign-attachment",
      expectedStatus: 201,
    }
  );
  await api(
    owner.token,
    `/api/v1/issues/${foreignIssue.key}/attachments/${foreignIntent.attachmentId}/download-url`,
    { expectedStatus: 404 }
  );

  const rollbackNeedle = `atomic-rollback-${randomUUID().slice(0, 8)}`;
  const rollbackIdempotencyKey = "stage4-atomic-rollback";
  const attachmentRollbackIdempotencyKey =
    "stage4-attachment-atomic-rollback";
  const rollbackRequestID = "stage4-forced-audit-failure";
  const rollbackAttachmentContent = new TextEncoder().encode(
    "must not become registered"
  );
  const rollbackAttachmentIntent = await api<{
    attachmentId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>(owner.token, `/api/v1/issues/${issue.key}/attachments`, {
    method: "POST",
    body: {
      fileName: "rollback.txt",
      contentType: "text/plain",
      sizeBytes: rollbackAttachmentContent.byteLength,
    },
    expectedStatus: 201,
  });
  await putPresigned(rollbackAttachmentIntent, rollbackAttachmentContent);
  const rollbackAttachmentKeys = attachmentObjectKeys({
    workspaceID: owner.workspaceID,
    issueID: issue.id,
    attachmentID: rollbackAttachmentIntent.attachmentId,
  });
  await getZeroPool().query(`
    CREATE OR REPLACE FUNCTION stage4_reject_audit() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.request_id = '${rollbackRequestID}' THEN
        RAISE EXCEPTION 'forced stage4 audit failure';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER stage4_reject_audit
    BEFORE INSERT ON api_audit_logs
    FOR EACH ROW EXECUTE FUNCTION stage4_reject_audit()
  `);
  try {
    await api(owner.token, "/api/v1/issues", {
      method: "POST",
      body: {
        projectKey,
        title: `Must roll back ${rollbackNeedle}`,
      },
      idempotencyKey: rollbackIdempotencyKey,
      requestId: rollbackRequestID,
      expectedStatus: 500,
    });
    await api(
      owner.token,
      `/api/v1/issues/${issue.key}/attachments/${rollbackAttachmentIntent.attachmentId}/confirm`,
      {
        method: "POST",
        idempotencyKey: attachmentRollbackIdempotencyKey,
        requestId: rollbackRequestID,
        expectedStatus: 500,
      }
    );
  } finally {
    await getZeroPool().query(`
      DROP TRIGGER IF EXISTS stage4_reject_audit ON api_audit_logs;
      DROP FUNCTION IF EXISTS stage4_reject_audit()
    `);
  }
  const rolledBackIssues = await api<Array<{ key: string }>>(
    owner.token,
    `/api/v1/issues?projectKey=${projectKey}&q=${rollbackNeedle}`
  );
  if (rolledBackIssues.length !== 0) {
    throw new Error("Audit failure did not roll back the domain mutation");
  }
  const rolledBackIdempotency = await getZeroPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM api_idempotency_keys
     WHERE api_token_id = $1 AND key = ANY($2::text[])`,
    [
      owner.tokenID,
      [rollbackIdempotencyKey, attachmentRollbackIdempotencyKey],
    ]
  );
  if (Number(rolledBackIdempotency.rows[0]?.count ?? 0) !== 0) {
    throw new Error("Audit failure left an idempotency record behind");
  }
  const rolledBackAttachment = await getZeroPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM attachments
     WHERE id = $1`,
    [rollbackAttachmentIntent.attachmentId]
  );
  if (Number(rolledBackAttachment.rows[0]?.count ?? 0) !== 0) {
    throw new Error("Audit failure left attachment metadata behind");
  }
  await expectObjectMissing(rollbackAttachmentKeys.final);
  await s3.send(
    new DeleteObjectCommand({
      Bucket: storageConfig.bucket,
      Key: rollbackAttachmentKeys.pending,
    })
  );

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
  await checkMcp(
    owner.token,
    projectKey,
    issue.key,
    page.id,
    attachment.id
  );

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
  const auditResult = await getZeroPool().query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM api_audit_logs
     WHERE api_token_id = $1`,
    [owner.tokenID]
  );
  const auditCount = Number(auditResult.rows[0]?.count ?? 0);
  if (auditCount !== 11) {
    throw new Error(`Expected 11 API audit records, got ${auditCount}`);
  }
  const legacySecurityTables = await prisma.$queryRaw<
    Array<{
      api_token: string | null;
      api_audit: string | null;
      api_idempotency: string | null;
    }>
  >`
    SELECT
      to_regclass('public."ApiToken"')::text AS api_token,
      to_regclass('public."ApiAuditLog"')::text AS api_audit,
      to_regclass('public."ApiIdempotencyKey"')::text AS api_idempotency
  `;
  if (
    legacySecurityTables[0]?.api_token ||
    legacySecurityTables[0]?.api_audit ||
    legacySecurityTables[0]?.api_idempotency
  ) {
    throw new Error("Legacy application database still has API security tables");
  }
  const legacyAuthRows = await prisma.$queryRaw<
    Array<{ users: bigint; sessions: bigint }>
  >`
    SELECT
      (SELECT count(*) FROM "User") AS users,
      (SELECT count(*) FROM "Session") AS sessions
  `;
  if (
    Number(legacyAuthRows[0]?.users ?? 0) !== 0 ||
    Number(legacyAuthRows[0]?.sessions ?? 0) !== 0
  ) {
    throw new Error("Zero auth gate wrote to the legacy application database");
  }

  console.log(
    JSON.stringify({
      apiAudit: true,
      apiAuditRollbackAtomic: true,
      apiSecuritySingleDatabase: true,
      authDuplicateDenied: true,
      authLegacyDatabaseUntouched: true,
      authLogin: true,
      authLogoutRevokesSession: true,
      authPersonalWorkspaceAtomic: true,
      authSessionExpiry: true,
      attachmentAuditRollbackAtomic: true,
      attachmentDownloadPresigned: true,
      attachmentIdempotencyReplay: true,
      attachmentMcpVisible: true,
      attachmentMetadataInZero: true,
      attachmentPendingCleanup: true,
      attachmentPrivateObject: true,
      attachmentUploadPresigned: true,
      attachmentViewerWriteDenied: true,
      attachmentWorkspaceIsolation: true,
      commentVisible: true,
      idempotencyReplay: true,
      issueSearch: true,
      issueSearchForeignWorkspaceHidden: true,
      issueSearchStatusFilter: true,
      mcpGetIssue: true,
      mcpIssueSearch: true,
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

void main().finally(async () => {
  s3.destroy();
  await prisma.$disconnect();
  await getZeroPool().end();
});
