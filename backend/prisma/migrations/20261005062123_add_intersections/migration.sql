-- CreateEnum
CREATE TYPE "IntersectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "intersections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "IntersectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intersections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_signals" (
    "id" TEXT NOT NULL,
    "intersectionId" TEXT NOT NULL,

    CONSTRAINT "traffic_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intersections_name_location_key" ON "intersections"("name", "location");

-- AddForeignKey
ALTER TABLE "traffic_signals" ADD CONSTRAINT "traffic_signals_intersectionId_fkey" FOREIGN KEY ("intersectionId") REFERENCES "intersections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
