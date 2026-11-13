import { randomUUID } from "node:crypto";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { hashPassword } from "../src/server/auth/password";
import { registerZeroPasswordUser } from "../src/server/auth/zero-store";
import { getZeroPool } from "../src/zero/db";

const upstream = new URL(process.env.ZERO_UPSTREAM_DB ?? "postgresql://invalid");
if (process.env.LOCAL_ZERO_QA !== "true" || upstream.hostname !== "127.0.0.1" || upstream.port !== "55433" || upstream.pathname !== "/pulsar") {
  throw new Error("This fixture is restricted to the local Zero QA database on 127.0.0.1:55433/pulsar.");
}

const pool = getZeroPool();
const password = "Pulsar-local-zero-2026";

async function ensureUser(email: string, displayName: string) {
  const existing = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM auth_identities WHERE provider = 'password' AND provider_subject = $1",
    [email]
  );
  if (existing.rows[0]) return existing.rows[0].user_id;
  const created = await registerZeroPasswordUser({ email, displayName, passwordHash: await hashPassword(password) });
  return created.id;
}

async function main() {
  const owner = await ensureUser("qa-zero@pulsar.local", "Александр QA");
  const member = await ensureUser("maria-zero@pulsar.local", "Мария QA");
  const viewer = await ensureUser("viewer-zero@pulsar.local", "Наблюдатель QA");
  const workspace = (await pool.query<{ id: string }>(
    "SELECT workspace_id AS id FROM workspace_members WHERE user_id = $1 AND role = 'OWNER' ORDER BY created_at LIMIT 1", [owner]
  )).rows[0].id;
  await pool.query("UPDATE workspaces SET name = 'TesterHub' WHERE id = $1", [workspace]);
  for (const [user, role] of [[member, "MEMBER"], [viewer, "VIEWER"]]) {
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, user_id) DO NOTHING", [workspace, user, role]);
  }
  const workflow = (await pool.query<{ id: string }>("SELECT id FROM workflows WHERE workspace_id = $1 AND is_default = true", [workspace])).rows[0].id;
  const states = (await pool.query<{ id: string; name: string }>("SELECT id, name FROM workflow_states WHERE workflow_id = $1", [workflow])).rows;
  for (const [key, name] of [["PULSAR", "Pulsar"], ["LMS", "EasyCourse"]]) {
    await pool.query(
      "INSERT INTO projects (id, workspace_id, workflow_id, key, name, knowledge_provider, next_issue_number, created_by_id) VALUES ($1,$2,$3,$4,$5,'NATIVE',20,$6) ON CONFLICT (key) DO NOTHING",
      [randomUUID(), workspace, workflow, key, name, owner]
    );
  }
  const project = (await pool.query<{ id: string }>("SELECT id FROM projects WHERE key = 'PULSAR' AND workspace_id = $1", [workspace])).rows[0].id;
  const titles = ["Спроектировать новую навигацию", "Собрать основу дизайн-системы", "Проверить роли и права доступа", "Обновить страницу проекта", "Добавить быстрые фильтры задач", "Настроить синхронизацию задач", "Адаптировать карточки для mobile", "Добавить ссылки на Wiki", "Уточнить сценарий приглашения"];
  const stateNames = ["Todo", "In progress", "Testing", "Done", "Todo", "In progress", "Testing", "Done", "Backlog"];
  for (let index = 0; index < titles.length; index++) {
    let issue = (await pool.query<{ id: string }>("SELECT id FROM issues WHERE project_id=$1 AND number=$2", [project, index + 1])).rows[0]?.id;
    if (!issue) {
      issue = randomUUID();
      await pool.query(
      "INSERT INTO issues (id,workspace_id,project_id,workflow_id,state_id,number,title,description,type,priority,rank,creator_id,reporter_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)",
      [issue, workspace, project, workflow, states.find(state => state.name === stateNames[index])!.id, index + 1, titles[index], "## Контекст\n\nЛокальная проверка Pulsar в режиме Zero.\n\n- Сохранить сценарий работы\n- Проверить синхронизацию между вкладками", index === 2 ? "BUG" : "TASK", index % 3 === 0 ? "HIGH" : "MEDIUM", String((index + 1) * 1024).padStart(20, "0"), owner]
      );
    }
    await pool.query("INSERT INTO issue_participants (workspace_id,issue_id,user_id,role,created_by_id) VALUES ($1,$2,$3,'ASSIGNEE',$4) ON CONFLICT DO NOTHING", [workspace, issue, index % 2 ? owner : member, owner]);
    const tagName = index % 2 ? "development" : "design";
    const tag = (await pool.query<{ id: string }>("INSERT INTO tags (id,workspace_id,name,color) VALUES ($1,$2,$3,'#9bb8c9') ON CONFLICT (workspace_id,lower(name)) WHERE archived_at IS NULL DO UPDATE SET name=EXCLUDED.name RETURNING id", [randomUUID(), workspace, tagName])).rows[0].id;
    await pool.query("INSERT INTO issue_tags (workspace_id,issue_id,tag_id,created_by_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [workspace, issue, tag, owner]);
  }
  const page = (await pool.query<{ id: string }>(
    "INSERT INTO wiki_pages (id,workspace_id,project_id,title,slug,content_markdown,created_by_id,updated_by_id) VALUES ($1,$2,$3,'Начало работы с Pulsar','getting-started',$4,$5,$5) ON CONFLICT (project_id,slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id",
    [randomUUID(), workspace, project, "# Общий контекст\n\nВся команда. Единый фокус. Пространство для важного.\n\n## Процесс\n\n1. Сформулируйте задачу\n2. Выберите приоритет\n3. Сохраните решение", owner]
  )).rows[0].id;
  await pool.query("INSERT INTO wiki_page_revisions (id,workspace_id,project_id,page_id,version,title,content_markdown,created_by_id) SELECT $1,workspace_id,project_id,id,version,title,content_markdown,$2 FROM wiki_pages WHERE id=$3 ON CONFLICT (page_id,version) DO NOTHING", [randomUUID(), owner, page]);

  const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
  try {
    const bucket = process.env.S3_BUCKET!;
    try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch { await s3.send(new CreateBucketCommand({ Bucket: bucket })); }
    await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [{ AllowedOrigins: ["http://127.0.0.1:3014", "http://localhost:3014"], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["etag"], MaxAgeSeconds: 300 }] } }));
  } finally { s3.destroy(); }
  console.log(JSON.stringify({ workspace, project, wikiPage: page, owner: "qa-zero@pulsar.local", member: "maria-zero@pulsar.local", viewer: "viewer-zero@pulsar.local", localOnly: true }, null, 2));
}

void main().finally(() => pool.end());
