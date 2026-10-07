-- AlterTable
ALTER TABLE "traffic_signals"
    ADD COLUMN "status" "SignalStatus" NOT NULL DEFAULT 'RED',
    ADD COLUMN "greenDuration" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "yellowDuration" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "redDuration" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "traffic_signals"
SET "updatedAt" = CURRENT_TIMESTAMP
WHERE "updatedAt" IS NULL;

ALTER TABLE "traffic_signals"
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "signal_config_history" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "previousConfig" TEXT,
    "newConfig" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_config_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "signal_config_history"
    ADD CONSTRAINT "signal_config_history_signalId_fkey"
    FOREIGN KEY ("signalId") REFERENCES "traffic_signals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signal_config_history"
    ADD CONSTRAINT "signal_config_history_changedByUserId_fkey"
    FOREIGN KEY ("changedByUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
