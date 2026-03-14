-- CreateTable
CREATE TABLE "PackingLog" (
    "id" TEXT NOT NULL,
    "packedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "PackingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingLog_tenantId_packedAt_idx" ON "PackingLog"("tenantId", "packedAt");

-- CreateIndex
CREATE INDEX "PackingLog_userId_packedAt_idx" ON "PackingLog"("userId", "packedAt");

-- AddForeignKey
ALTER TABLE "PackingLog" ADD CONSTRAINT "PackingLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingLog" ADD CONSTRAINT "PackingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingLog" ADD CONSTRAINT "PackingLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
