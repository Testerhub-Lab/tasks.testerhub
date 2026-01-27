import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const DEFAULT_PROJECT = {
  key: "TH",
  name: "TesterHub",
};

const ensureDefaultProject = async () => {
  const existing = await prisma.project.findUnique({
    where: { key: DEFAULT_PROJECT.key },
  });
  if (existing) {
    return existing;
  }
  return prisma.project.create({ data: DEFAULT_PROJECT });
};

const run = async () => {
  const defaultProject = await ensureDefaultProject();

  await prisma.$executeRaw`UPDATE "Task" SET "projectId" = ${defaultProject.id} WHERE "projectId" IS NULL OR "projectId" = ''`;

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true },
  });

  for (const project of projects) {
    const numberRows = await prisma.$queryRaw`
      SELECT "number" FROM "Task"
      WHERE "projectId" = ${project.id} AND "number" IS NOT NULL
    `;
    const usedNumbers = new Set(
      numberRows.map((row) => Number(row.number)).filter((value) => Number.isFinite(value))
    );
    let maxNumber = 0;
    for (const value of usedNumbers) {
      if (value > maxNumber) maxNumber = value;
    }
    let nextNumber = maxNumber + 1;

    const tasksToUpdate = await prisma.$queryRaw`
      SELECT "id", "key", "number", "createdAt" FROM "Task"
      WHERE "projectId" = ${project.id}
        AND ("key" IS NULL OR "key" = '' OR "number" IS NULL)
      ORDER BY "createdAt" ASC
    `;

    if (tasksToUpdate.length === 0) {
      await prisma.project.update({
        where: { id: project.id },
        data: { nextIssueNumber: nextNumber },
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const task of tasksToUpdate) {
        let number = task.number ? Number(task.number) : null;
        const key = task.key ? String(task.key) : null;

        if (!number && key) {
          const match = key.match(/^([A-Z0-9]+)-(\d+)$/);
          if (match && match[1] === project.key) {
            const parsed = Number(match[2]);
            if (Number.isFinite(parsed) && !usedNumbers.has(parsed)) {
              number = parsed;
            }
          }
        }

        if (!number || usedNumbers.has(number)) {
          number = nextNumber;
          nextNumber += 1;
        }

        const issueKey = `${project.key}-${number}`;
        await tx.task.update({
          where: { id: task.id },
          data: { number, key: issueKey },
        });
        usedNumbers.add(number);
        if (number > maxNumber) maxNumber = number;
      }

      await tx.project.update({
        where: { id: project.id },
        data: { nextIssueNumber: maxNumber + 1 },
      });
    });
  }
};

run()
  .then(() => {
    console.log("Backfill completed.");
  })
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
