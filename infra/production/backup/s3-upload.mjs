#!/usr/bin/env node
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const command = process.argv[2];
const backupDir = process.argv[3];

if (
  ![
    "upload",
    "retention",
    "upload-and-retain",
    "status",
    "download-latest",
  ].includes(command)
) {
  throw new Error(
    "Usage: s3-upload.mjs upload|retention|upload-and-retain /backup | status | download-latest /target"
  );
}
if ((command === "upload" || command === "upload-and-retain") && !backupDir) {
  throw new Error("backup directory is required");
}
if (command === "download-latest" && !backupDir) {
  throw new Error("download target directory is required");
}

const env = process.env;
const endpoint = required("S3_ENDPOINT");
const region = env.S3_REGION?.trim() || "default";
const bucket = (
  env.PULSAR_BACKUP_S3_BUCKET ||
  env.BACKUP_S3_BUCKET ||
  env.S3_BUCKET
)?.trim();
if (!bucket) {
  throw new Error("PULSAR_BACKUP_S3_BUCKET, BACKUP_S3_BUCKET, or S3_BUCKET is required");
}
const prefix = normalizePrefix(
  env.PULSAR_BACKUP_S3_PREFIX || env.BACKUP_S3_PREFIX || "backups/postgres"
);
const backupName = (
  env.PULSAR_BACKUP_NAME ||
  (backupDir ? path.basename(path.resolve(backupDir)) : "")
).trim();
if ((command === "upload" || command === "upload-and-retain") && !backupName) {
  throw new Error("backup name is required");
}

const keepDaily = positiveInt(env.PULSAR_BACKUP_KEEP_DAILY, 14);
const keepWeekly = positiveInt(env.PULSAR_BACKUP_KEEP_WEEKLY, 8);
const keepMonthly = positiveInt(env.PULSAR_BACKUP_KEEP_MONTHLY, 6);
const dryRun = env.PULSAR_BACKUP_RETENTION_DRY_RUN === "1";

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: (env.S3_FORCE_PATH_STYLE || "true").toLowerCase() !== "false",
  credentials: {
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  },
});

const result = {};
if (command === "upload" || command === "upload-and-retain") {
  result.upload = await uploadBackup(backupDir, backupName);
}
if (command === "retention" || command === "upload-and-retain") {
  result.retention = await applyRetention();
}
if (command === "status") {
  result.status = await getStatus();
}
if (command === "download-latest") {
  result.download = await downloadLatestBackup(backupDir);
}

process.stdout.write(`${JSON.stringify(result)}\n`);

function required(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(raw, fallback) {
  const value = Number.parseInt(raw || "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizePrefix(value) {
  return value
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function uploadBackup(root, name) {
  const files = await walkFiles(root);
  let uploaded = 0;
  let bytes = 0;
  const baseKey = `${prefix}/${name}`;

  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const key = `${baseKey}/${relative}`;
    const info = await stat(file);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: info.size,
      })
    );
    uploaded += 1;
    bytes += info.size;
  }

  return {
    bucket,
    prefix,
    backupName: name,
    objectPrefix: `${baseKey}/`,
    uploaded,
    bytes,
  };
}

async function listBackupObjects() {
  const objects = [];
  let ContinuationToken;
  const listPrefix = `${prefix}/`;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: listPrefix,
        ContinuationToken,
      })
    );
    objects.push(...(response.Contents || []));
    ContinuationToken = response.NextContinuationToken;
  } while (ContinuationToken);

  return objects;
}

async function applyRetention() {
  const objects = await listBackupObjects();
  const generations = groupGenerationKeys(objects);

  const keep = chooseGenerationsToKeep([...generations.keys()]);
  const deleteKeys = [];
  for (const [generation, keys] of generations) {
    if (!keep.has(generation)) deleteKeys.push(...keys);
  }

  if (!dryRun) {
    for (let index = 0; index < deleteKeys.length; index += 1000) {
      const chunk = deleteKeys.slice(index, index + 1000);
      if (!chunk.length) continue;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
    }
  }

  return {
    bucket,
    prefix,
    generationsSeen: generations.size,
    generationsKept: keep.size,
    objectsSeen: objects.length,
    objectsDeleted: dryRun ? 0 : deleteKeys.length,
    objectsWouldDelete: dryRun ? deleteKeys.length : 0,
    dryRun,
    keepDaily,
    keepWeekly,
    keepMonthly,
  };
}

async function getStatus() {
  const objects = await listBackupObjects();
  const summaries = summarizeGenerations(objects);

  return {
    bucket,
    prefix,
    generationsSeen: summaries.length,
    objectsSeen: objects.length,
    latestGeneration: summaries[0] || null,
    latestCompleteGeneration:
      summaries.find((generation) => generation.complete) || null,
  };
}

async function downloadLatestBackup(targetRoot) {
  const resolvedTargetRoot = path.resolve(targetRoot);
  const objects = await listBackupObjects();
  const summaries = summarizeGenerations(objects);
  const latestComplete = summaries.find((generation) => generation.complete);
  if (!latestComplete) {
    throw new Error(`No complete backup generation found under ${prefix}/`);
  }

  const generationRoot = path.join(resolvedTargetRoot, latestComplete.name);
  await mkdir(generationRoot, { recursive: true });
  const baseKey = `${prefix}/${latestComplete.name}/`;
  let downloaded = 0;
  let bytes = 0;

  for (const object of objects) {
    if (!object.Key || !object.Key.startsWith(baseKey)) continue;
    const relative = object.Key.slice(baseKey.length);
    const targetPath = path.resolve(generationRoot, ...relative.split("/"));
    if (!targetPath.startsWith(`${generationRoot}${path.sep}`)) {
      throw new Error(`Unsafe S3 object key: ${object.Key}`);
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: object.Key,
      })
    );
    if (!response.Body) {
      throw new Error(`Empty S3 object body: ${object.Key}`);
    }
    await pipeline(response.Body, createWriteStream(targetPath));
    downloaded += 1;
    bytes += object.Size || 0;
  }

  return {
    bucket,
    prefix,
    backupName: latestComplete.name,
    objectPrefix: baseKey,
    targetDir: generationRoot,
    dumpFile: path.join(
      generationRoot,
      latestComplete.dumpKey.slice(baseKey.length)
    ),
    downloaded,
    bytes,
  };
}

function groupGenerationKeys(objects) {
  const generations = new Map();

  for (const object of objects) {
    if (!object.Key) continue;
    const rest = object.Key.slice(`${prefix}/`.length);
    const generation = rest.split("/")[0];
    if (!isBackupGeneration(generation)) continue;
    const current = generations.get(generation) || [];
    current.push(object.Key);
    generations.set(generation, current);
  }

  return generations;
}

function summarizeGenerations(objects) {
  const byGeneration = new Map();
  const listPrefix = `${prefix}/`;

  for (const object of objects) {
    if (!object.Key || !object.Key.startsWith(listPrefix)) continue;
    const rest = object.Key.slice(listPrefix.length);
    const generation = rest.split("/")[0];
    if (!isBackupGeneration(generation)) continue;
    const summary =
      byGeneration.get(generation) ||
      {
        name: generation,
        objectPrefix: `${listPrefix}${generation}/`,
        objects: 0,
        bytes: 0,
        hasDump: false,
        hasSha256: false,
        hasManifest: false,
        hasRestoreSummary: false,
        dumpKey: null,
        lastModified: null,
      };
    const relative = rest.slice(`${generation}/`.length);
    summary.objects += 1;
    summary.bytes += object.Size || 0;
    if (/^pulsar-pg18-\d{8}T\d{6}Z\.dump$/.test(relative)) {
      summary.hasDump = true;
      summary.dumpKey = object.Key;
    }
    if (/^pulsar-pg18-\d{8}T\d{6}Z\.dump\.sha256$/.test(relative)) {
      summary.hasSha256 = true;
    }
    if (relative === "manifest.json") {
      summary.hasManifest = true;
    }
    if (/^restore-check-.+\/summary\.json$/.test(relative)) {
      summary.hasRestoreSummary = true;
    }
    if (
      object.LastModified &&
      (!summary.lastModified || object.LastModified > new Date(summary.lastModified))
    ) {
      summary.lastModified = object.LastModified.toISOString();
    }
    byGeneration.set(generation, summary);
  }

  return [...byGeneration.values()]
    .map((summary) => ({
      ...summary,
      complete: summary.hasDump && summary.hasSha256 && summary.hasManifest,
    }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function isBackupGeneration(value) {
  return /^\d{8}T\d{6}Z$/.test(value);
}

function parseGeneration(value) {
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(9, 11);
  const minute = value.slice(11, 13);
  const second = value.slice(13, 15);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

function chooseGenerationsToKeep(generations) {
  const sorted = generations
    .map((name) => ({ name, date: parseGeneration(name) }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const keep = new Set();

  for (const item of sorted.slice(0, keepDaily)) keep.add(item.name);

  const weekly = new Set();
  for (const item of sorted) {
    const key = isoWeekKey(item.date);
    if (weekly.has(key)) continue;
    weekly.add(key);
    keep.add(item.name);
    if (weekly.size >= keepWeekly) break;
  }

  const monthly = new Set();
  for (const item of sorted) {
    const key = `${item.date.getUTCFullYear()}-${String(
      item.date.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    if (monthly.has(key)) continue;
    monthly.add(key);
    keep.add(item.name);
    if (monthly.size >= keepMonthly) break;
  }

  return keep;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
