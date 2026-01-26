-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[];
