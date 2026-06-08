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

/** Formats a gram value for label copy (no unit suffix). */
export function formatGramsForLabel(grams: number): string {
  return Number.isInteger(grams) ? `${grams}` : grams.toFixed(1).replace(/\.0$/, '');
}

export function formatNetWeightEs(_oz: number, lbs: number): string {
  const g = netWeightGramsFromLbs(lbs);
  return `Contenido Neto: ${formatGramsForLabel(g)} g`;
}

/** Formats a date for label copy (DD/MM/YYYY). Returns empty string when absent. */
export function formatLabelDateEs(date: Date | null | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export type LotLabelFields = {
  labelConservationText?: string | null;
  labelElaborationDate?: Date | null;
  labelExpirationDate?: Date | null;
  labelManufacturedBy?: string | null;
};

export function buildLabelElaborationLine(date: Date | null | undefined): string {
  return `Fecha de Elaboración: ${formatLabelDateEs(date)}`;
}

export function buildLabelExpirationLine(date: Date | null | undefined): string {
  return `Fecha de Caducidad: ${formatLabelDateEs(date)}`;
}

export function buildLabelManufacturedByLine(text: string | null | undefined): string {
  const value = text?.trim() ?? '';
  return `Fabricado por: ${value}`;
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
