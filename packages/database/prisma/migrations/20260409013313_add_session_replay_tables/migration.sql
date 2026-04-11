-- CreateEnum
CREATE TYPE "SessionEventType" AS ENUM ('CLICK', 'ROUTE', 'NETWORK_ERROR', 'CONSOLE_ERROR', 'EXCEPTION');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "sessionCaptureEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SessionRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "release" TEXT,
    "userAgent" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "hasReplayData" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionRecordId" TEXT NOT NULL,
    "eventType" "SessionEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionReplayChunk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionRecordId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "compressedData" BYTEA NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "startTimestamp" TIMESTAMP(3) NOT NULL,
    "endTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionReplayChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionRecord_workspaceId_userEmail_lastEventAt_idx" ON "SessionRecord"("workspaceId", "userEmail", "lastEventAt");

-- CreateIndex
CREATE INDEX "SessionRecord_workspaceId_userId_lastEventAt_idx" ON "SessionRecord"("workspaceId", "userId", "lastEventAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRecord_workspaceId_sessionId_key" ON "SessionRecord"("workspaceId", "sessionId");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionRecordId_timestamp_idx" ON "SessionEvent"("sessionRecordId", "timestamp");

-- CreateIndex
CREATE INDEX "SessionReplayChunk_sessionRecordId_sequenceNumber_idx" ON "SessionReplayChunk"("sessionRecordId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "SessionRecord" ADD CONSTRAINT "SessionRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionRecordId_fkey" FOREIGN KEY ("sessionRecordId") REFERENCES "SessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReplayChunk" ADD CONSTRAINT "SessionReplayChunk_sessionRecordId_fkey" FOREIGN KEY ("sessionRecordId") REFERENCES "SessionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReplayChunk" ADD CONSTRAINT "SessionReplayChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
