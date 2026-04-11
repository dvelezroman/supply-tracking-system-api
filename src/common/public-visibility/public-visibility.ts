import type { TraceabilityEvent } from '@prisma/client';

/** Keys admin can toggle for the public QR trace page. All default to true (fully open). */
export const PUBLIC_VISIBILITY_KEYS = [
  'showProductName',
  'showProductSku',
  'showProductCategory',
  'showPresentation',
  'showPackaging',
  'showWeightKg',
  'showSizeClassification',
  'showColorSalmoFan',
  'showTexture',
  'showCertifications',
  'showLotSizeLbs',
  'showLotCode',
  'showHarvestDate',
  'showPoolNumber',
  'showHarvestWeightGrams',
  'showFarmName',
  'showFarmLocation',
  'showParticipantLab',
  'showParticipantMaturation',
  'showParticipantCoPacker',
  'showTraceTimeline',
  'showEventLocation',
  'showEventNotes',
  'showEventActorType',
  'showEventMetadata',
  'showPublicQrBlock',
] as const;

export type PublicVisibilityKey = (typeof PUBLIC_VISIBILITY_KEYS)[number];

export const DEFAULT_PUBLIC_VISIBILITY: Record<PublicVisibilityKey, boolean> =
  PUBLIC_VISIBILITY_KEYS.reduce(
    (acc, k) => {
      acc[k] = true;
      return acc;
    },
    {} as Record<PublicVisibilityKey, boolean>,
  );

const KEY_SET = new Set<string>(PUBLIC_VISIBILITY_KEYS);

export function isPublicVisibilityKey(k: string): k is PublicVisibilityKey {
  return KEY_SET.has(k);
}

export function parseVisibilityJson(raw: unknown): Partial<Record<PublicVisibilityKey, boolean>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Partial<Record<PublicVisibilityKey, boolean>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isPublicVisibilityKey(k) && typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

export function resolveVisibility(
  stored: unknown,
): Record<PublicVisibilityKey, boolean> {
  const partial = parseVisibilityJson(stored);
  return { ...DEFAULT_PUBLIC_VISIBILITY, ...partial };
}

/** Assumes `patch` keys were validated (admin API). Unknown keys are ignored. */
export function mergeVisibilityPatch(
  current: unknown,
  patch: Record<string, boolean>,
): Record<PublicVisibilityKey, boolean> {
  const base = resolveVisibility(current);
  for (const [k, v] of Object.entries(patch)) {
    if (!isPublicVisibilityKey(k) || typeof v !== 'boolean') continue;
    base[k] = v;
  }
  return base;
}

export type PublicTraceLotPayload = {
  lotCode: string | null;
  product: { name: string | null; sku: string | null; category: string | null };
  presentation: string | null;
  packaging: string | null;
  weightKg: number | null;
  sizeClassification: string | null;
  colorSalmoFan: string | null;
  texture: string | null;
  certifications: string[] | null;
  lotSizeLbs: number | null;
  harvestDate: Date | null;
  poolNumber: number | null;
  harvestWeightGrams: number | null;
  origin: {
    farm: { name: string | null; location: string | null };
    lab: { name: string | null; location: string | null };
    maturation: { name: string | null; location: string | null };
    coPacker: { name: string | null; location: string | null };
  };
};

export type PublicTraceEventPayload = {
  eventType: TraceabilityEvent['eventType'];
  timestamp: Date;
  location: string | null;
  notes: string | null;
  actor: { name: string; type: string | null; location: string | null };
  metadata: Record<string, unknown> | null;
};

export function buildPublicTracePayload(
  lot: {
    lotCode: string;
    presentation: string;
    packaging: string;
    weightKg: number;
    sizeClassification: string;
    colorSalmoFan: string;
    texture: string | null;
    certifications: string[];
    lotSizeLbs: number;
    harvestDate: Date;
    poolNumber: number;
    harvestWeightGrams: number;
    product: { name: string; sku: string; category: string | null };
    farm: { name: string; location: string | null };
    lab: { name: string; location: string | null };
    maturation: { name: string; location: string | null };
    coPacker: { name: string; location: string | null };
  },
  events: Array<
    TraceabilityEvent & {
      actor: { name: string; type: string; location: string | null };
    }
  >,
  vis: Record<PublicVisibilityKey, boolean>,
): { lot: PublicTraceLotPayload; events: PublicTraceEventPayload[] } {
  const show = (k: PublicVisibilityKey) => vis[k] !== false;

  const lotOut: PublicTraceLotPayload = {
    lotCode: show('showLotCode') ? lot.lotCode : null,
    product: {
      name: show('showProductName') ? lot.product.name : null,
      sku: show('showProductSku') ? lot.product.sku : null,
      category: show('showProductCategory') ? lot.product.category : null,
    },
    presentation: show('showPresentation') ? lot.presentation : null,
    packaging: show('showPackaging') ? lot.packaging : null,
    weightKg: show('showWeightKg') ? lot.weightKg : null,
    sizeClassification: show('showSizeClassification') ? lot.sizeClassification : null,
    colorSalmoFan: show('showColorSalmoFan') ? lot.colorSalmoFan : null,
    texture: show('showTexture') ? lot.texture : null,
    certifications: show('showCertifications') ? lot.certifications : null,
    lotSizeLbs: show('showLotSizeLbs') ? lot.lotSizeLbs : null,
    harvestDate: show('showHarvestDate') ? lot.harvestDate : null,
    poolNumber: show('showPoolNumber') ? lot.poolNumber : null,
    harvestWeightGrams: show('showHarvestWeightGrams') ? lot.harvestWeightGrams : null,
    origin: {
      farm: {
        name: show('showFarmName') ? lot.farm.name : null,
        location: show('showFarmLocation') ? lot.farm.location : null,
      },
      lab: {
        name: show('showParticipantLab') ? lot.lab.name : null,
        location: show('showParticipantLab') ? lot.lab.location : null,
      },
      maturation: {
        name: show('showParticipantMaturation') ? lot.maturation.name : null,
        location: show('showParticipantMaturation') ? lot.maturation.location : null,
      },
      coPacker: {
        name: show('showParticipantCoPacker') ? lot.coPacker.name : null,
        location: show('showParticipantCoPacker') ? lot.coPacker.location : null,
      },
    },
  };

  if (!show('showTraceTimeline')) {
    return { lot: lotOut, events: [] };
  }

  const eventsOut: PublicTraceEventPayload[] = events.map((e) => ({
    eventType: e.eventType,
    timestamp: e.timestamp,
    location: show('showEventLocation') ? e.location : null,
    notes: show('showEventNotes') ? e.notes : null,
    actor: {
      name: e.actor.name,
      type: show('showEventActorType') ? e.actor.type : null,
      location: e.actor.location,
    },
    metadata: show('showEventMetadata')
      ? (e.metadata as Record<string, unknown> | null)
      : null,
  }));

  return { lot: lotOut, events: eventsOut };
}
