-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "publicVisibility" JSONB;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "publicVisibilityDefaults" JSONB;
