-- Add unique constraint for issue number per project
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_number_key" UNIQUE ("projectId", "number");

-- Make key and number non-null (requires backfill before applying)
ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "projectId" SET NOT NULL;
