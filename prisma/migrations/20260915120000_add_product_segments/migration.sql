-- CreateTable
CREATE TABLE "product_segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_segments_name_key" ON "product_segments"("name");

-- AlterTable
ALTER TABLE "products" ADD COLUMN "segmentId" TEXT;

-- CreateIndex
CREATE INDEX "products_segmentId_idx" ON "products"("segmentId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "product_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
