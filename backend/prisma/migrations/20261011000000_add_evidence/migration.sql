-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_storageKey_key" ON "evidence"("storageKey");
CREATE INDEX "evidence_violationId_idx" ON "evidence"("violationId");
CREATE INDEX "evidence_uploaderId_idx" ON "evidence"("uploaderId");
CREATE INDEX "evidence_createdAt_idx" ON "evidence"("createdAt");

-- AddForeignKey
ALTER TABLE "evidence"
    ADD CONSTRAINT "evidence_violationId_fkey"
    FOREIGN KEY ("violationId") REFERENCES "violations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evidence"
    ADD CONSTRAINT "evidence_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
