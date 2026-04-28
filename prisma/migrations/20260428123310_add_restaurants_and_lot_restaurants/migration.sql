-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "contact" TEXT,
    "slug" TEXT NOT NULL,
    "publicMenuTraceUrl" TEXT NOT NULL,
    "menuQrCodeDataUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_restaurants" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "lot_restaurants_lotId_idx" ON "lot_restaurants"("lotId");

-- CreateIndex
CREATE INDEX "lot_restaurants_restaurantId_idx" ON "lot_restaurants"("restaurantId");

-- CreateIndex
CREATE INDEX "lot_restaurants_createdAt_idx" ON "lot_restaurants"("createdAt");

-- AddForeignKey
ALTER TABLE "lot_restaurants" ADD CONSTRAINT "lot_restaurants_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_restaurants" ADD CONSTRAINT "lot_restaurants_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
