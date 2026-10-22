-- CreateTable
CREATE TABLE "marketplace_online_checkout_sessions" (
    "id" TEXT NOT NULL,
    "paymentMethod" "MarketplacePaymentMethod" NOT NULL,
    "plannedOrderNumber" TEXT NOT NULL,
    "clientTransactionId" TEXT,
    "paypalOrderId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "notes" TEXT,
    "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalCents" INTEGER NOT NULL,
    "listSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountTotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_online_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_online_checkout_sessions_plannedOrderNumber_key" ON "marketplace_online_checkout_sessions"("plannedOrderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_online_checkout_sessions_clientTransactionId_key" ON "marketplace_online_checkout_sessions"("clientTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_online_checkout_sessions_paypalOrderId_key" ON "marketplace_online_checkout_sessions"("paypalOrderId");

-- CreateIndex
CREATE INDEX "marketplace_online_checkout_sessions_createdAt_idx" ON "marketplace_online_checkout_sessions"("createdAt");
