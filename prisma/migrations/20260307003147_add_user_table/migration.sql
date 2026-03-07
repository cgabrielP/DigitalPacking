/*
  Warnings:

  - You are about to drop the column `userId` on the `MercadoLibreAccount` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncAt` on the `Tenant` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tenantId,mlUserId]` on the table `MercadoLibreAccount` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `mlUserId` to the `MercadoLibreAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mlAccountId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'PICKER', 'DELIVERY');

-- DropIndex
DROP INDEX "MercadoLibreAccount_tenantId_key";

-- AlterTable
ALTER TABLE "MercadoLibreAccount" DROP COLUMN "userId",
ADD COLUMN     "email" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "mlUserId" TEXT NOT NULL,
ADD COLUMN     "nickname" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mlAccountId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "lastSyncAt";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PICKER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MercadoLibreAccount_tenantId_mlUserId_key" ON "MercadoLibreAccount"("tenantId", "mlUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_mlAccountId_fkey" FOREIGN KEY ("mlAccountId") REFERENCES "MercadoLibreAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
