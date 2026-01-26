-- Create Project table
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nextIssueNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- Add project-aware fields to Task
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Task" ADD COLUMN "number" INTEGER;
ALTER TABLE "Task" ADD COLUMN "key" TEXT;

CREATE UNIQUE INDEX "Task_key_key" ON "Task"("key");
CREATE INDEX "Task_projectId_number_idx" ON "Task"("projectId", "number");

ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
