-- AlterEnum
ALTER TYPE "MarketplaceOrderStatus" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "MarketplaceOrderStatus" ADD VALUE 'PAID';
ALTER TYPE "MarketplaceOrderStatus" ADD VALUE 'PAYMENT_FAILED';

-- CreateEnum
CREATE TYPE "MarketplacePaymentMethod" AS ENUM ('EMAIL', 'PAYPAL');

-- AlterTable
ALTER TABLE "marketplace_orders" ADD COLUMN     "paymentMethod" "MarketplacePaymentMethod" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "paypalOrderId" TEXT,
ADD COLUMN     "paypalCaptureId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentError" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_paypalOrderId_key" ON "marketplace_orders"("paypalOrderId");

-- AlterTable
ALTER TABLE "marketplace_settings" ADD COLUMN     "onlinePaymentsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "paypal_webhook_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paypal_webhook_events_pkey" PRIMARY KEY ("id")
);
