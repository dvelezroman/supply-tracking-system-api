-- AlterTable
ALTER TABLE "users" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "marketplace_orders" ADD COLUMN "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "WhatsappNotificationSource" AS ENUM ('AUTO', 'STAFF');

-- CreateTable
CREATE TABLE "whatsapp_notification_dedup" (
    "id" TEXT NOT NULL,
    "occasionKey" VARCHAR(160) NOT NULL,
    "recipientKey" VARCHAR(100) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_notification_dedup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_notification_logs" (
    "id" TEXT NOT NULL,
    "occasionKey" VARCHAR(160) NOT NULL,
    "recipientKey" VARCHAR(100) NOT NULL,
    "recipientLabel" VARCHAR(120),
    "occasion" VARCHAR(40) NOT NULL,
    "source" "WhatsappNotificationSource" NOT NULL DEFAULT 'AUTO',
    "actorUserId" TEXT,
    "marketplaceOrderId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_notification_dedup_sentAt_idx" ON "whatsapp_notification_dedup"("sentAt");

-- CreateIndex
CREATE INDEX "whatsapp_notification_dedup_occasionKey_idx" ON "whatsapp_notification_dedup"("occasionKey");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_notification_dedup_occasionKey_recipientKey_key" ON "whatsapp_notification_dedup"("occasionKey", "recipientKey");

-- CreateIndex
CREATE INDEX "whatsapp_notification_logs_sentAt_idx" ON "whatsapp_notification_logs"("sentAt");

-- CreateIndex
CREATE INDEX "whatsapp_notification_logs_occasion_idx" ON "whatsapp_notification_logs"("occasion");

-- CreateIndex
CREATE INDEX "whatsapp_notification_logs_marketplaceOrderId_idx" ON "whatsapp_notification_logs"("marketplaceOrderId");

-- CreateIndex
CREATE INDEX "whatsapp_notification_logs_occasionKey_recipientKey_idx" ON "whatsapp_notification_logs"("occasionKey", "recipientKey");

-- AddForeignKey
ALTER TABLE "whatsapp_notification_logs" ADD CONSTRAINT "whatsapp_notification_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_notification_logs" ADD CONSTRAINT "whatsapp_notification_logs_marketplaceOrderId_fkey" FOREIGN KEY ("marketplaceOrderId") REFERENCES "marketplace_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
