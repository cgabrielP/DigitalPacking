-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('MERCADOLIBRE', 'FALABELLA', 'RIPLEY', 'WALMART', 'HITES');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PICKED', 'PACKED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerName" TEXT,
ADD COLUMN     "externalOrderId" TEXT,
ADD COLUMN     "marketplace" "Marketplace",
ADD COLUMN     "marketplaceAccountId" TEXT,
ADD COLUMN     "marketplaceCreatedAt" TIMESTAMP(3),
ADD COLUMN     "normalizedStatus" "OrderStatus",
ADD COLUMN     "shippingAddress" JSONB;

-- CreateTable
CREATE TABLE "MarketplaceAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "nickname" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceAccount_tenantId_idx" ON "MarketplaceAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAccount_tenantId_marketplace_nickname_key" ON "MarketplaceAccount"("tenantId", "marketplace", "nickname");

-- AddForeignKey
ALTER TABLE "MarketplaceAccount" ADD CONSTRAINT "MarketplaceAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
