-- CreateEnum
CREATE TYPE "MarketplacePaymentStatus" AS ENUM ('INITIATED', 'CONFIRMED', 'FAILED');

-- AlterEnum
ALTER TYPE "MarketplacePaymentMethod" ADD VALUE 'CARD';

-- AlterTable
ALTER TABLE "marketplace_orders" ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payphoneClientTxId" TEXT;

-- Backfill totalCents = subtotalCents for existing rows
UPDATE "marketplace_orders" SET "totalCents" = "subtotalCents" WHERE "totalCents" = 0;

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_payphoneClientTxId_key" ON "marketplace_orders"("payphoneClientTxId");

-- AlterTable
ALTER TABLE "marketplace_settings" ADD COLUMN     "cardPaymentsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "marketplace_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "payphoneId" INTEGER,
    "clientTransactionId" TEXT NOT NULL,
    "status" "MarketplacePaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amountCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "authorizationCode" TEXT,
    "transactionId" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "marketplace_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_payments_clientTransactionId_key" ON "marketplace_payments"("clientTransactionId");

-- CreateIndex
CREATE INDEX "marketplace_payments_orderId_idx" ON "marketplace_payments"("orderId");

-- AddForeignKey
ALTER TABLE "marketplace_payments" ADD CONSTRAINT "marketplace_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
