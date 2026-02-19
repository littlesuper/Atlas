-- DropIndex
DROP INDEX "weekly_reports_projectId_year_weekNumber_key";

-- CreateIndex
CREATE INDEX "weekly_reports_projectId_year_weekNumber_idx" ON "weekly_reports"("projectId", "year", "weekNumber");
