-- AlterEnum
ALTER TYPE "MarketplaceOrderStatus" ADD VALUE 'FULFILLED';

-- AlterTable marketplace_products: Payphone CARD stock hold
ALTER TABLE "marketplace_products" ADD COLUMN "reservedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable marketplace_orders: manual fulfillment
ALTER TABLE "marketplace_orders" ADD COLUMN "fulfilledAt" TIMESTAMP(3);
