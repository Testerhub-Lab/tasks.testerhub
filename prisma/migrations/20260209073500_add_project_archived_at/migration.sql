-- AlterTable
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Index
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");
