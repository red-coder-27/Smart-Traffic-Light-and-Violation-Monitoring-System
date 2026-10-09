-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "intersectionId" TEXT NOT NULL,
    "trafficSignalId" TEXT NOT NULL,
    "violationType" TEXT NOT NULL,
    "description" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "violatingUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "violations_occurredAt_idx" ON "violations"("occurredAt");
CREATE INDEX "violations_intersectionId_idx" ON "violations"("intersectionId");
CREATE INDEX "violations_trafficSignalId_idx" ON "violations"("trafficSignalId");
CREATE INDEX "violations_recordedByUserId_idx" ON "violations"("recordedByUserId");
CREATE INDEX "violations_violatingUserId_idx" ON "violations"("violatingUserId");

-- AddForeignKey
ALTER TABLE "violations"
    ADD CONSTRAINT "violations_intersectionId_fkey"
    FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "violations"
    ADD CONSTRAINT "violations_trafficSignalId_fkey"
    FOREIGN KEY ("trafficSignalId") REFERENCES "traffic_signals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "violations"
    ADD CONSTRAINT "violations_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "violations"
    ADD CONSTRAINT "violations_violatingUserId_fkey"
    FOREIGN KEY ("violatingUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
