-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_marketplaceAccountId_fkey";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "externalOrderId" SET NOT NULL,
ALTER COLUMN "marketplace" SET NOT NULL,
ALTER COLUMN "marketplaceAccountId" SET NOT NULL,
ALTER COLUMN "normalizedStatus" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Order_tenantId_normalizedStatus_idx" ON "Order"("tenantId", "normalizedStatus");

-- CreateIndex
CREATE INDEX "Order_tenantId_marketplace_idx" ON "Order"("tenantId", "marketplace");

-- CreateIndex
CREATE INDEX "Order_marketplaceAccountId_idx" ON "Order"("marketplaceAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_marketplace_externalOrderId_key" ON "Order"("tenantId", "marketplace", "externalOrderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
