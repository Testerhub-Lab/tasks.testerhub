-- Add soft-delete and creator tracking for tasks
ALTER TABLE "Task"
ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "creatorId" TEXT;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_creatorId_fkey"
FOREIGN KEY ("creatorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_isDeleted_idx" ON "Task"("isDeleted");
CREATE INDEX "Task_creatorId_idx" ON "Task"("creatorId");
