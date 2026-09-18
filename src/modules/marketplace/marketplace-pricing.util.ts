export type MarketplaceProductPricing = {
  priceCents: number;
  discountPercent?: number | null;
  promoDiscountPercent?: number | null;
};

export function clampDiscountPercent(value: number | null | undefined): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

/** Combined % off PVP (base + promo), capped at 100. */
export function totalDiscountPercent(
  product: Pick<
    MarketplaceProductPricing,
    'discountPercent' | 'promoDiscountPercent'
  >,
): number {
  return Math.min(
    100,
    clampDiscountPercent(product.discountPercent) +
      clampDiscountPercent(product.promoDiscountPercent),
  );
}

/** Sale unit price from PVP and stacked discount percentages. */
export function effectiveUnitPriceCents(
  product: MarketplaceProductPricing,
): number {
  const pvp = Math.max(0, Math.floor(Number(product.priceCents)) || 0);
  const pct = totalDiscountPercent(product);
  if (pct <= 0) return pvp;
  if (pct >= 100) return 0;
  return Math.round((pvp * (100 - pct)) / 100);
}

export function lineDiscountCents(
  listUnitPriceCents: number,
  unitPriceCents: number,
  qty: number,
): number {
  const q = Math.max(0, Math.floor(Number(qty)) || 0);
  const list = Math.max(0, Math.floor(Number(listUnitPriceCents)) || 0);
  const unit = Math.max(0, Math.floor(Number(unitPriceCents)) || 0);
  return Math.max(0, (list - unit) * q);
}
