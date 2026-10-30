-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appeals_violationId_key" ON "appeals"("violationId");
CREATE INDEX "appeals_citizenId_idx" ON "appeals"("citizenId");
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

-- AddForeignKey
ALTER TABLE "appeals"
    ADD CONSTRAINT "appeals_violationId_fkey"
    FOREIGN KEY ("violationId") REFERENCES "violations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appeals"
    ADD CONSTRAINT "appeals_citizenId_fkey"
    FOREIGN KEY ("citizenId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

