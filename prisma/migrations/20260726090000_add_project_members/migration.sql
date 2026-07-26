-- Remove the legacy global/guest access switches. Authorization is membership-based.
DROP TABLE IF EXISTS "Setting";
ALTER TABLE "Project" DROP COLUMN "allowGuest";

-- Project-scoped roles.
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

ALTER TABLE "WorkspaceInvite"
ADD COLUMN "projectRole" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN "accessDurationDays" INTEGER;

CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX "ProjectMember_projectId_expiresAt_idx" ON "ProjectMember"("projectId", "expiresAt");
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

ALTER TABLE "ProjectMember"
ADD CONSTRAINT "ProjectMember_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember"
ADD CONSTRAINT "ProjectMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Upload_storedName_key" ON "Upload"("storedName");
CREATE INDEX "Upload_projectId_idx" ON "Upload"("projectId");
CREATE INDEX "Upload_uploadedById_idx" ON "Upload"("uploadedById");

ALTER TABLE "Upload"
ADD CONSTRAINT "Upload_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Upload"
ADD CONSTRAINT "Upload_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve access for existing non-admin workspace members.
INSERT INTO "ProjectMember" (
    "id",
    "projectId",
    "userId",
    "role",
    "createdAt",
    "updatedAt"
)
SELECT
    "WorkspaceMember"."id" || ':' || "Project"."id",
    "Project"."id",
    "WorkspaceMember"."userId",
    'MEMBER'::"ProjectRole",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "WorkspaceMember"
INNER JOIN "Project"
    ON "Project"."workspaceId" = "WorkspaceMember"."workspaceId"
WHERE "WorkspaceMember"."role" = 'MEMBER'
ON CONFLICT ("projectId", "userId") DO NOTHING;
