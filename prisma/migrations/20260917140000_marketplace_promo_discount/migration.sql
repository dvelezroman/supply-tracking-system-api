ALTER TABLE "marketplace_products"
ADD COLUMN "promoDiscountPercent" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "marketplace_order_items"
ADD COLUMN "promoDiscountPercent" INTEGER NOT NULL DEFAULT 0;
