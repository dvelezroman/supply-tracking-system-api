import { Presentation } from '@prisma/client';

/** Product-specific description line on the retail label front (by lot presentation). */
export const PRESENTATION_LABEL_SUBTITLE: Record<Presentation, string> = {
  [Presentation.PD_TAIL_OFF]: 'Camarón cola, pelado, desvenado y congelado',
  [Presentation.PD_TAIL_ON]: 'Camarón cola, pelado y congelado',
  [Presentation.SHELL_ON]: 'Descabezado con cáscara',
  [Presentation.BUTTERFLY]: 'Camarón mariposa (butterfly), pelado y congelado',
};

export const INGREDIENTS_TEXT = 'Ingredientes: Camarón Blanco (Litopenaeus vannamei).';

export const CONSERVATION_TEXT =
  'Manténgase congelado a -18°C o una temperatura inferior. Una vez descongelado, no volver a congelar. Consumir plenamente cocido.';

export const SEMAFORO_EXEMPTION_TEXT =
  'Producto exento de etiquetado gráfico (Semáforo Nutricional) según la normativa técnico-sanitaria vigente por ser un alimento primario en estado natural congelado.';

const LB_TO_G = 453.592;

/** Grams from pounds (rounded for label copy). */
export function netWeightGramsFromLbs(lbs: number): number {
  return Math.round(lbs * LB_TO_G);
}

/** EAN-13 check digit from the first 12 digits. */
export function ean13CheckDigit(gtin12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(gtin12[i]!, 10) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** Validates a 13-digit GTIN (EAN-13) including checksum. */
export function isValidGtin13(gtin: string): boolean {
  const digits = gtin.replace(/\D/g, '');
  if (digits.length !== 13 || !/^\d{13}$/.test(digits)) return false;
  const expected = ean13CheckDigit(digits.slice(0, 12));
  return parseInt(digits[12]!, 10) === expected;
}

/** Normalizes to 13 digits or returns null if invalid. */
export function normalizeGtin13(gtin: string): string | null {
  const digits = gtin.replace(/\D/g, '');
  if (digits.length !== 13) return null;
  return isValidGtin13(digits) ? digits : null;
}

export function formatNetWeightEs(oz: number, lbs: number): string {
  const g = netWeightGramsFromLbs(lbs);
  const ozStr = Number.isInteger(oz) ? `${oz}` : oz.toFixed(1).replace(/\.0$/, '');
  const lbsStr = Number.isInteger(lbs) ? `${lbs}` : lbs.toFixed(2).replace(/\.?0+$/, '');
  return `Contenido Neto: ${ozStr} oz / ${lbsStr} lbs (${g} g)`;
}

export function buildManufacturingLine(opts: {
  coPackerName: string;
  ownerLegalName: string;
  ownerRuc: string;
  ownerLocation: string;
}): string {
  const { coPackerName, ownerLegalName, ownerRuc, ownerLocation } = opts;
  return `Fabricado por: ${coPackerName} para ${ownerLegalName}. RUC: ${ownerRuc}. ${ownerLocation}.`;
}

export function buildSanitaryArcsaLine(code: string | null | undefined, fallback: string): string {
  const value = code?.trim() || fallback.trim() || 'En trámite';
  return `Notificación Sanitaria ARCSA: ${value}`;
}

/** Placeholder GTIN for seed/demo — replace with GS1 Ecuador code before retail print run. */
export const DEMO_GTIN12_ECUADOR = '593123456789';

export function demoGtin13(): string {
  return `${DEMO_GTIN12_ECUADOR}${ean13CheckDigit(DEMO_GTIN12_ECUADOR)}`;
}
