PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_holidays" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
    "year" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BUILT_IN',
    "sourceUrl" TEXT,
    "syncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_holidays" (
    "id",
    "date",
    "name",
    "type",
    "year",
    "source",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "date",
    "name",
    "type",
    "year",
    CASE
        WHEN "source" = 'manual' THEN 'MANUAL_INPUT'
        WHEN "source" = 'generated' THEN 'BUILT_IN'
        ELSE "source"
    END,
    "createdAt",
    "updatedAt"
FROM "holidays";

DROP TABLE "holidays";
ALTER TABLE "new_holidays" RENAME TO "holidays";
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");
CREATE INDEX "holidays_year_idx" ON "holidays"("year");

CREATE TABLE "new_template_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TASK',
    "phase" TEXT,
    "planDuration" INTEGER,
    "dependencies" JSONB,
    "notes" TEXT,
    "roleId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "template_activities_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "project_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "template_activities_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_template_activities" (
    "id",
    "templateId",
    "name",
    "type",
    "phase",
    "planDuration",
    "dependencies",
    "notes",
    "sortOrder"
)
SELECT
    "id",
    "templateId",
    "name",
    "type",
    "phase",
    "planDuration",
    "dependencies",
    "notes",
    "sortOrder"
FROM "template_activities";

DROP TABLE "template_activities";
ALTER TABLE "new_template_activities" RENAME TO "template_activities";
CREATE INDEX "template_activities_templateId_idx" ON "template_activities"("templateId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
