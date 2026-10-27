-- CreateEnum
CREATE TYPE "SignalDirection" AS ENUM ('NORTH', 'EAST', 'SOUTH', 'WEST');

-- CreateEnum
CREATE TYPE "EmergencyVehicleType" AS ENUM ('AMBULANCE', 'FIRE_ENGINE', 'POLICE_VEHICLE');

-- CreateEnum
CREATE TYPE "EmergencyPriorityStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'TIMED_OUT');

-- AddColumn
ALTER TABLE "traffic_signals" ADD COLUMN "direction" "SignalDirection";

-- CreateIndex
CREATE UNIQUE INDEX "traffic_signals_intersectionId_direction_key"
    ON "traffic_signals"("intersectionId", "direction");

-- CreateTable
CREATE TABLE "emergency_priority_requests" (
    "id" TEXT NOT NULL,
    "intersectionId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "direction" "SignalDirection" NOT NULL,
    "vehicleType" "EmergencyVehicleType" NOT NULL,
    "status" "EmergencyPriorityStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByUserId" TEXT NOT NULL,
    "controlledByUserId" TEXT,
    "previousStatuses" TEXT,
    "restorationError" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_priority_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emergency_priority_requests_intersectionId_status_idx"
    ON "emergency_priority_requests"("intersectionId", "status");

-- CreateIndex
CREATE INDEX "emergency_priority_requests_requestedAt_idx"
    ON "emergency_priority_requests"("requestedAt");

-- Prevent overlapping pending or active requests at one intersection.
CREATE UNIQUE INDEX "emergency_priority_requests_one_open_per_intersection_key"
    ON "emergency_priority_requests"("intersectionId")
    WHERE "status" IN ('REQUESTED', 'ACTIVE');

-- AddForeignKey
ALTER TABLE "emergency_priority_requests"
    ADD CONSTRAINT "emergency_priority_requests_intersectionId_fkey"
    FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "emergency_priority_requests"
    ADD CONSTRAINT "emergency_priority_requests_signalId_fkey"
    FOREIGN KEY ("signalId") REFERENCES "traffic_signals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "emergency_priority_requests"
    ADD CONSTRAINT "emergency_priority_requests_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "emergency_priority_requests"
    ADD CONSTRAINT "emergency_priority_requests_controlledByUserId_fkey"
    FOREIGN KEY ("controlledByUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
