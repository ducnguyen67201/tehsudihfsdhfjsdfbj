-- DropIndex (full unique that blocks re-creation after soft delete)
DROP INDEX "SessionRecord_workspaceId_sessionId_key";

-- CreateIndex (partial unique: only active records must be unique)
CREATE UNIQUE INDEX "SessionRecord_workspaceId_sessionId_key"
  ON "SessionRecord"("workspaceId", "sessionId")
  WHERE "deletedAt" IS NULL;
