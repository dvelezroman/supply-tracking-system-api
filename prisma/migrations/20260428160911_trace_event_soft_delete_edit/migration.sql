-- AlterTable
ALTER TABLE "traceability_events" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "traceability_events" ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "traceability_events" SET "updatedAt" = COALESCE("timestamp", CURRENT_TIMESTAMP);

ALTER TABLE "traceability_events" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "traceability_events_deletedAt_idx" ON "traceability_events"("deletedAt");
