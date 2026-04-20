import { Packaging, Presentation } from '@prisma/client';

/** Presentation segment in canonical lot codes (matches existing seed style). */
export function presentationSegment(presentation: Presentation): string {
  const map: Record<Presentation, string> = {
    [Presentation.SHELL_ON]: 'SO',
    [Presentation.BUTTERFLY]: 'BF',
    [Presentation.PD_TAIL_OFF]: 'PD',
    [Presentation.PD_TAIL_ON]: 'PT',
  };
  return map[presentation];
}

/** Packaging segment (CAJAS → CBX per existing seed). */
export function packagingSegment(packaging: Packaging): string {
  return packaging === Packaging.IQF ? 'IQF' : 'CBX';
}

/** MMYY from ISO date string (UTC month/year). */
export function harvestMmyy(harvestDateIso: string): string {
  const d = new Date(harvestDateIso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}${yy}`;
}

/** `P{pool}-{MMYY}-{PRE}-{PKG}` — no suffix. */
export function buildLotCodeBase(
  poolNumber: number,
  harvestDateIso: string,
  presentation: Presentation,
  packaging: Packaging,
): string {
  const mmyy = harvestMmyy(harvestDateIso);
  return `P${poolNumber}-${mmyy}-${presentationSegment(presentation)}-${packagingSegment(packaging)}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Next unique lot code for this product: `base` if no lot uses that exact code yet,
 * otherwise the next `base-01`, `base-02`, … (two-digit numeric suffix) above the
 * highest existing numeric suffix for this product (gaps are allowed).
 */
export function nextLotCodeForProduct(base: string, existingCodesForProduct: string[]): string {
  const taken = new Set(existingCodesForProduct);
  if (!taken.has(base)) {
    return base;
  }

  const reNumeric = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);
  let maxNum = 0;
  for (const code of existingCodesForProduct) {
    if (code === base) continue;
    const m = code.match(reNumeric);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }

  const next = maxNum + 1;
  return `${base}-${String(next).padStart(2, '0')}`;
}
