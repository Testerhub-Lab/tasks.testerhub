CREATE TYPE "KnowledgeProvider" AS ENUM ('DISABLED', 'NATIVE', 'EXTERNAL');

CREATE TABLE "ProjectKnowledge" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "KnowledgeProvider" NOT NULL DEFAULT 'DISABLED',
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WikiPageRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPageRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "KnowledgeProvider" NOT NULL,
    "documentKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectKnowledge_projectId_key" ON "ProjectKnowledge"("projectId");
CREATE UNIQUE INDEX "WikiPage_projectId_slug_key" ON "WikiPage"("projectId", "slug");
CREATE INDEX "WikiPage_projectId_parentId_archivedAt_sortOrder_idx" ON "WikiPage"("projectId", "parentId", "archivedAt", "sortOrder");
CREATE UNIQUE INDEX "WikiPageRevision_pageId_version_key" ON "WikiPageRevision"("pageId", "version");
CREATE INDEX "WikiPageRevision_pageId_createdAt_idx" ON "WikiPageRevision"("pageId", "createdAt");
CREATE UNIQUE INDEX "KnowledgeLink_taskId_provider_documentKey_key" ON "KnowledgeLink"("taskId", "provider", "documentKey");
CREATE INDEX "KnowledgeLink_projectId_idx" ON "KnowledgeLink"("projectId");

ALTER TABLE "ProjectKnowledge"
ADD CONSTRAINT "ProjectKnowledge_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WikiPage"
ADD CONSTRAINT "WikiPage_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WikiPage"
ADD CONSTRAINT "WikiPage_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WikiPage"
ADD CONSTRAINT "WikiPage_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WikiPage"
ADD CONSTRAINT "WikiPage_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WikiPageRevision"
ADD CONSTRAINT "WikiPageRevision_pageId_fkey"
FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WikiPageRevision"
ADD CONSTRAINT "WikiPageRevision_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeLink"
ADD CONSTRAINT "KnowledgeLink_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeLink"
ADD CONSTRAINT "KnowledgeLink_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeLink"
ADD CONSTRAINT "KnowledgeLink_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
