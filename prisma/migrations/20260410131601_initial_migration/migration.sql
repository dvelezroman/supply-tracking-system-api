-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SUPPLIER', 'MANUFACTURER', 'WAREHOUSE', 'DISTRIBUTOR', 'RETAILER', 'CONSUMER', 'FARM', 'LAB', 'MATURATION', 'CO_PACKER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'HARVESTED', 'TRANSPORTED', 'RECEIVED', 'QUALITY_CHECKED', 'PROCESSED', 'PACKAGED', 'STORED', 'SHIPPED', 'SOLD', 'DELIVERED');

-- CreateEnum
CREATE TYPE "Presentation" AS ENUM ('SHELL_ON', 'BUTTERFLY', 'PD_TAIL_OFF', 'PD_TAIL_ON');

-- CreateEnum
CREATE TYPE "Packaging" AS ENUM ('IQF', 'CAJAS');

-- CreateEnum
CREATE TYPE "SizeClassification" AS ENUM ('S16_20', 'S21_25', 'S26_30', 'S31_35', 'S36_40', 'S41_50');

-- CreateEnum
CREATE TYPE "ColorSalmoFan" AS ENUM ('A1', 'A2', 'A3', 'A4');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ActorType" NOT NULL,
    "location" TEXT,
    "contact" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "presentation" "Presentation" NOT NULL,
    "packaging" "Packaging" NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "sizeClassification" "SizeClassification" NOT NULL,
    "colorSalmoFan" "ColorSalmoFan" NOT NULL,
    "texture" TEXT,
    "certifications" TEXT[],
    "lotSizeLbs" DOUBLE PRECISION NOT NULL,
    "harvestDate" TIMESTAMP(3) NOT NULL,
    "poolNumber" INTEGER NOT NULL,
    "harvestWeightGrams" DOUBLE PRECISION NOT NULL,
    "farmId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "maturationId" TEXT NOT NULL,
    "coPackerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traceability_events" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traceability_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "lots_lotCode_key" ON "lots"("lotCode");

-- CreateIndex
CREATE INDEX "lots_productId_idx" ON "lots"("productId");

-- CreateIndex
CREATE INDEX "lots_harvestDate_idx" ON "lots"("harvestDate");

-- CreateIndex
CREATE INDEX "traceability_events_lotId_idx" ON "traceability_events"("lotId");

-- CreateIndex
CREATE INDEX "traceability_events_actorId_idx" ON "traceability_events"("actorId");

-- CreateIndex
CREATE INDEX "traceability_events_timestamp_idx" ON "traceability_events"("timestamp");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "actors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_labId_fkey" FOREIGN KEY ("labId") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_maturationId_fkey" FOREIGN KEY ("maturationId") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_coPackerId_fkey" FOREIGN KEY ("coPackerId") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_events" ADD CONSTRAINT "traceability_events_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traceability_events" ADD CONSTRAINT "traceability_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "actors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
