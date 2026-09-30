/** Exclusive IVA: tax = round(subtotal * rateBps / 10000). */
export const DEFAULT_TAX_RATE_BPS = 1500;

export type PayphoneAmountBreakdown = {
  /** amountWithTax — base subject to tax (exclusive of IVA). */
  amountWithTax: number;
  /** IVA cents. */
  tax: number;
  /** Always 0 for exclusive-IVA cart. */
  amountWithoutTax: number;
  service: number;
  tip: number;
  /** amountWithoutTax + amountWithTax + tax + service + tip */
  amount: number;
};

/**
 * Payphone Cajita amounts from a tax-exclusive subtotal (cents).
 * amount = amountWithTax + tax (amountWithoutTax/service/tip = 0).
 */
export function fromSubtotalExclusiveTax(
  subtotalCents: number,
  rateBps: number = DEFAULT_TAX_RATE_BPS,
): PayphoneAmountBreakdown {
  const amountWithTax = Math.max(0, Math.floor(Number(subtotalCents)) || 0);
  const bps = Math.max(0, Math.floor(Number(rateBps)) || 0);
  const tax =
    amountWithTax === 0 || bps === 0
      ? 0
      : Math.round((amountWithTax * bps) / 10000);
  return {
    amountWithTax,
    tax,
    amountWithoutTax: 0,
    service: 0,
    tip: 0,
    amount: amountWithTax + tax,
  };
}

/** Truncate clientTransactionId to Payphone max 50 chars. */
export function truncateClientTxId(value: string, max = 50): string {
  const s = String(value || '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max);
}

/** Truncate reference to Payphone max 100 chars. */
export function truncateReference(value: string, max = 100): string {
  const s = String(value || '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max);
}
