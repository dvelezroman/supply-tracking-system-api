-- AlterTable
ALTER TABLE "lots" ADD COLUMN "labelConservationText" TEXT;
ALTER TABLE "lots" ADD COLUMN "labelElaborationDate" TIMESTAMP(3);
ALTER TABLE "lots" ADD COLUMN "labelExpirationDate" TIMESTAMP(3);
ALTER TABLE "lots" ADD COLUMN "labelManufacturedBy" TEXT;
