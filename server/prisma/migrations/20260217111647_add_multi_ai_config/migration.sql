-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ai_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "apiUrl" TEXT NOT NULL DEFAULT '',
    "modelName" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "features" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ai_configs" ("apiKey", "apiUrl", "id", "modelName", "updatedAt") SELECT "apiKey", "apiUrl", "id", "modelName", "updatedAt" FROM "ai_configs";
DROP TABLE "ai_configs";
ALTER TABLE "new_ai_configs" RENAME TO "ai_configs";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
