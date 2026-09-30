-- AlterEnum
ALTER TYPE "MarketplacePaymentMethod" ADD VALUE 'BANK_TRANSFER';

-- AlterTable
ALTER TABLE "marketplace_settings" ADD COLUMN     "bankTransferEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankAccountType" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankBeneficiaryName" TEXT,
ADD COLUMN     "bankBeneficiaryRuc" TEXT,
ADD COLUMN     "bankContactEmail" TEXT;

-- Seed default bank details for Jaraminay / Pichincha
UPDATE "marketplace_settings"
SET
  "bankTransferEnabled" = true,
  "bankName" = 'Banco Pichincha',
  "bankAccountType" = 'Cuenta de ahorro transaccional',
  "bankAccountNumber" = '2216329132',
  "bankBeneficiaryName" = 'Jaraminay S.A.',
  "bankBeneficiaryRuc" = '0993340332001',
  "bankContactEmail" = 'sociedadjaramillominaya@gmail.com'
WHERE "id" = 'default';
