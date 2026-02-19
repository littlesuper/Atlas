-- CreateIndex
CREATE INDEX "activities_projectId_idx" ON "activities"("projectId");

-- CreateIndex
CREATE INDEX "activities_assigneeId_idx" ON "activities"("assigneeId");

-- CreateIndex
CREATE INDEX "activities_parentId_idx" ON "activities"("parentId");

-- CreateIndex
CREATE INDEX "products_projectId_idx" ON "products"("projectId");

-- CreateIndex
CREATE INDEX "projects_managerId_idx" ON "projects"("managerId");

-- CreateIndex
CREATE INDEX "weekly_reports_createdBy_idx" ON "weekly_reports"("createdBy");
