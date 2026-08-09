ALTER TABLE "WikiPage"
ADD COLUMN "reviewAssigneeId" TEXT;

ALTER TABLE "WikiPage"
ADD CONSTRAINT "WikiPage_reviewAssigneeId_fkey"
FOREIGN KEY ("reviewAssigneeId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
