BEGIN;
ALTER TABLE "Task" ADD COLUMN "parentId" text,
  ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Task_parent_check" CHECK ("parentId" IS NULL OR (id <> "parentId" AND upper(type) <> 'EPIC'));
CREATE INDEX "Task_parentId_idx" ON "Task" ("parentId");
COMMIT;
