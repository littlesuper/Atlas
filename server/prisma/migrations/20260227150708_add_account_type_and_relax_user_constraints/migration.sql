-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_risk_assessments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskFactors" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rule_engine',
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "risk_assessments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_risk_assessments" ("assessedAt", "id", "projectId", "riskFactors", "riskLevel", "suggestions") SELECT "assessedAt", "id", "projectId", "riskFactors", "riskLevel", "suggestions" FROM "risk_assessments";
DROP TABLE "risk_assessments";
ALTER TABLE "new_risk_assessments" RENAME TO "risk_assessments";
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "email" TEXT,
    "password" TEXT,
    "realName" TEXT NOT NULL,
    "phone" TEXT,
    "wecomUserId" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "preferences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "id", "password", "phone", "preferences", "realName", "status", "updatedAt", "username", "wecomUserId") SELECT "createdAt", "email", "id", "password", "phone", "preferences", "realName", "status", "updatedAt", "username", "wecomUserId" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_wecomUserId_key" ON "users"("wecomUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
