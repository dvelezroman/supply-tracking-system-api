-- Add per-lot retail label display name (distinct from catalogue product name).
ALTER TABLE "lots" ADD COLUMN "labelName" TEXT;

-- Backfill from product retail title when available.
UPDATE "lots" AS l
SET "labelName" = COALESCE(NULLIF(TRIM(p."labelTitle"), ''), 'Producto')
FROM "products" AS p
WHERE l."productId" = p.id;

ALTER TABLE "lots" ALTER COLUMN "labelName" SET NOT NULL;
