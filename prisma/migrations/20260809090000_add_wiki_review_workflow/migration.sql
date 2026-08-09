CREATE TYPE "WikiWorkflowStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED');
CREATE TYPE "WikiReviewDecisionType" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');
CREATE TYPE "WikiCommentThreadStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "WikiPage"
ADD COLUMN "workflowStatus" "WikiWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "reviewVersion" INTEGER,
ADD COLUMN "approvedVersion" INTEGER,
ADD COLUMN "reviewRequestedById" TEXT,
ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);

CREATE TABLE "WikiReviewDecision" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "decision" "WikiReviewDecisionType" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WikiReviewDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiCommentThread" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "anchorQuote" TEXT,
  "status" "WikiCommentThreadStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "WikiCommentThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiComment" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "WikiComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiAttachment" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "WikiAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiReviewDecision_pageId_createdAt_idx"
ON "WikiReviewDecision"("pageId", "createdAt");
CREATE INDEX "WikiCommentThread_pageId_status_createdAt_idx"
ON "WikiCommentThread"("pageId", "status", "createdAt");
CREATE INDEX "WikiComment_threadId_createdAt_idx"
ON "WikiComment"("threadId", "createdAt");
CREATE UNIQUE INDEX "WikiAttachment_objectKey_key"
ON "WikiAttachment"("objectKey");
CREATE INDEX "WikiAttachment_pageId_createdAt_idx"
ON "WikiAttachment"("pageId", "createdAt");

ALTER TABLE "WikiPage"
ADD CONSTRAINT "WikiPage_reviewRequestedById_fkey"
FOREIGN KEY ("reviewRequestedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiReviewDecision"
ADD CONSTRAINT "WikiReviewDecision_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiReviewDecision"
ADD CONSTRAINT "WikiReviewDecision_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "WikiPageRevision"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiReviewDecision"
ADD CONSTRAINT "WikiReviewDecision_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WikiCommentThread"
ADD CONSTRAINT "WikiCommentThread_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiCommentThread"
ADD CONSTRAINT "WikiCommentThread_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "WikiPageRevision"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiCommentThread"
ADD CONSTRAINT "WikiCommentThread_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WikiCommentThread"
ADD CONSTRAINT "WikiCommentThread_resolvedById_fkey"
FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiComment"
ADD CONSTRAINT "WikiComment_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "WikiCommentThread"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiComment"
ADD CONSTRAINT "WikiComment_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WikiAttachment"
ADD CONSTRAINT "WikiAttachment_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WikiAttachment"
ADD CONSTRAINT "WikiAttachment_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
