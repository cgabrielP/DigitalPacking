-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryPromise" TEXT,
ADD COLUMN     "estimatedDeliveryFinal" TIMESTAMP(3),
ADD COLUMN     "estimatedDeliveryLimit" TIMESTAMP(3),
ADD COLUMN     "estimatedDeliveryTime" TIMESTAMP(3),
ADD COLUMN     "shippingDeliverTo" TEXT,
ADD COLUMN     "shippingMethodId" INTEGER,
ADD COLUMN     "shippingMethodName" TEXT,
ADD COLUMN     "shippingMethodType" TEXT;
