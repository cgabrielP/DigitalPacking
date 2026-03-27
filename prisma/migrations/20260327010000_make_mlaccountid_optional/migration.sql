-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_mlAccountId_fkey";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "mlAccountId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_mlAccountId_fkey" FOREIGN KEY ("mlAccountId") REFERENCES "MercadoLibreAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
