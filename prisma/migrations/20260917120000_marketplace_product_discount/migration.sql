-- Per-product PVP discount (% off list price) and order discount snapshots

ALTER TABLE "marketplace_products"
ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "marketplace_orders"
ADD COLUMN "listSubtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discountTotalCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "marketplace_order_items"
ADD COLUMN "listUnitPriceCents" INTEGER,
ADD COLUMN "discountPercent" INTEGER NOT NULL DEFAULT 0;

UPDATE "marketplace_order_items"
SET "listUnitPriceCents" = "unitPriceCents"
WHERE "listUnitPriceCents" IS NULL;

ALTER TABLE "marketplace_order_items"
ALTER COLUMN "listUnitPriceCents" SET NOT NULL;

UPDATE "marketplace_orders"
SET
  "listSubtotalCents" = "subtotalCents",
  "discountTotalCents" = 0
WHERE "listSubtotalCents" = 0;
