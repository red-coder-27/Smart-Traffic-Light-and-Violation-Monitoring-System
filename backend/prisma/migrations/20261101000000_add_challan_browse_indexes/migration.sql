CREATE INDEX "challans_createdAt_idx" ON "challans"("createdAt");
CREATE INDEX "challans_citizenId_createdAt_idx" ON "challans"("citizenId", "createdAt");
