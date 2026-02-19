-- AlterTable
ALTER TABLE "products" ADD COLUMN "documents" JSONB;

-- CreateTable
CREATE TABLE "product_change_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_change_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "product_change_logs_productId_idx" ON "product_change_logs"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "products_model_revision_key" ON "products"("model", "revision");
