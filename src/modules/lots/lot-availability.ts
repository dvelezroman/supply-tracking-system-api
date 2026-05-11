/** lb → kg (international avoirdupois pound) */
export const LB_TO_KG = 0.45359237;

/** Si vienen cajas + kg y la báscula difiere menos que esto del peso teórico (cajas × peso/unidad), se usa el peso teórico. */
export const DELIVERED_KG_MISMATCH_TOLERANCE_RATIO = 0.02;

export type ParsedDeliveredLine = {
  kg: number;
  /** Cajas contadas o equivalente fraccionario si solo hay peso */
  boxUnits: number;
};

export type LotAvailabilityComputed = {
  initialWeightKg: number;
  initialBoxes: number;
  deliveredWeightKg: number;
  deliveredBoxUnits: number;
  remainingWeightKg: number;
  remainingBoxes: number;
};

export function computeInitialInventory(lot: { lotSizeLbs: number; weightKg: number }) {
  const initialWeightKg = lot.lotSizeLbs * LB_TO_KG;
  const initialBoxes = Math.floor(initialWeightKg / lot.weightKg);
  return { initialWeightKg, initialBoxes };
}

function toPositiveNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = Number(String(v).trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Reads DELIVERED metadata: `quantity` (cajas) and/or `deliveredWeightKg`.
 * If both are present and disagree materially on implied kg, explicit kg wins for mass.
 */
export function parseDeliveredLine(
  metadata: unknown,
  unitWeightKg: number,
): ParsedDeliveredLine | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const q = toPositiveNumber(m['quantity']);
  const w = toPositiveNumber(m['deliveredWeightKg']);

  if (q == null && w == null) return null;

  if (q != null && w != null) {
    const expectedKg = q * unitWeightKg;
    const tol = Math.max(0.001, expectedKg * DELIVERED_KG_MISMATCH_TOLERANCE_RATIO);
    if (Math.abs(w - expectedKg) > tol) {
      return { kg: w, boxUnits: q };
    }
    return { kg: expectedKg, boxUnits: q };
  }

  if (q != null) {
    return { kg: q * unitWeightKg, boxUnits: q };
  }

  const kg = w!;
  return {
    kg,
    boxUnits: unitWeightKg > 0 ? kg / unitWeightKg : 0,
  };
}

export function sumDeliveredLines(
  events: { metadata: unknown }[],
  unitWeightKg: number,
): { totalKg: number; totalBoxUnits: number } {
  let totalKg = 0;
  let totalBoxUnits = 0;
  for (const e of events) {
    const line = parseDeliveredLine(e.metadata, unitWeightKg);
    if (line) {
      totalKg += line.kg;
      totalBoxUnits += line.boxUnits;
    }
  }
  return { totalKg, totalBoxUnits };
}

export function roundKg(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function computeAvailabilityFromParts(
  lot: { lotSizeLbs: number; weightKg: number },
  deliveredEvents: { metadata: unknown }[],
): LotAvailabilityComputed {
  const { initialWeightKg, initialBoxes } = computeInitialInventory(lot);
  const { totalKg, totalBoxUnits } = sumDeliveredLines(deliveredEvents, lot.weightKg);
  const remainingWeightKg = Math.max(0, roundKg(initialWeightKg - totalKg));
  const remainingBoxes =
    lot.weightKg > 0 ? Math.max(0, Math.floor(remainingWeightKg / lot.weightKg)) : 0;

  return {
    initialWeightKg: roundKg(initialWeightKg),
    initialBoxes,
    deliveredWeightKg: roundKg(totalKg),
    deliveredBoxUnits: roundKg(totalBoxUnits),
    remainingWeightKg,
    remainingBoxes,
  };
}
