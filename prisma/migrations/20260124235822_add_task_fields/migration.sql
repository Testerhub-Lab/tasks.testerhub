/*
  Warnings:

  - You are about to drop the column `attachments` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `desc` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `labels` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `project` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Task` table. All the data in the column will be lost.
  - The `status` column on the `Task` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `priority` column on the `Task` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Task" DROP COLUMN "attachments",
DROP COLUMN "desc",
DROP COLUMN "labels",
DROP COLUMN "project",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "requesterEmail" TEXT,
ADD COLUMN     "requesterName" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Open',
DROP COLUMN "priority",
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'Medium';
