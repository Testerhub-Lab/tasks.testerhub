CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "apiTokenId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiIdempotencyKey" (
    "id" TEXT NOT NULL,
    "apiTokenId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenPrefix_key" ON "ApiToken"("tokenPrefix");
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_userId_revokedAt_idx" ON "ApiToken"("userId", "revokedAt");
CREATE INDEX "ApiToken_expiresAt_idx" ON "ApiToken"("expiresAt");

CREATE INDEX "ApiAuditLog_userId_createdAt_idx" ON "ApiAuditLog"("userId", "createdAt");
CREATE INDEX "ApiAuditLog_apiTokenId_createdAt_idx" ON "ApiAuditLog"("apiTokenId", "createdAt");
CREATE INDEX "ApiAuditLog_projectId_createdAt_idx" ON "ApiAuditLog"("projectId", "createdAt");
CREATE INDEX "ApiAuditLog_resourceType_resourceId_idx" ON "ApiAuditLog"("resourceType", "resourceId");

CREATE UNIQUE INDEX "ApiIdempotencyKey_apiTokenId_key_key" ON "ApiIdempotencyKey"("apiTokenId", "key");
CREATE INDEX "ApiIdempotencyKey_expiresAt_idx" ON "ApiIdempotencyKey"("expiresAt");

ALTER TABLE "ApiToken"
ADD CONSTRAINT "ApiToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiAuditLog"
ADD CONSTRAINT "ApiAuditLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiAuditLog"
ADD CONSTRAINT "ApiAuditLog_apiTokenId_fkey"
FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiAuditLog"
ADD CONSTRAINT "ApiAuditLog_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiIdempotencyKey"
ADD CONSTRAINT "ApiIdempotencyKey_apiTokenId_fkey"
FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
