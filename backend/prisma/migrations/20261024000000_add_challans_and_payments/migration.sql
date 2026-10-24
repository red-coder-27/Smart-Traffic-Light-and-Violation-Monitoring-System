-- CreateEnum
CREATE TYPE "ChallanStatus" AS ENUM ('UNPAID', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "challans" (
    "id" TEXT NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "citizenId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "ChallanStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "failureReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challans_challanNumber_key" ON "challans"("challanNumber");
CREATE UNIQUE INDEX "challans_violationId_key" ON "challans"("violationId");
CREATE INDEX "challans_citizenId_idx" ON "challans"("citizenId");
CREATE INDEX "challans_status_idx" ON "challans"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");
CREATE UNIQUE INDEX "payment_transactions_idempotencyKey_key" ON "payment_transactions"("idempotencyKey");
CREATE INDEX "payment_transactions_challanId_idx" ON "payment_transactions"("challanId");

-- AddForeignKey
ALTER TABLE "challans"
    ADD CONSTRAINT "challans_violationId_fkey"
    FOREIGN KEY ("violationId") REFERENCES "violations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "challans"
    ADD CONSTRAINT "challans_citizenId_fkey"
    FOREIGN KEY ("citizenId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_transactions"
    ADD CONSTRAINT "payment_transactions_challanId_fkey"
    FOREIGN KEY ("challanId") REFERENCES "challans"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
