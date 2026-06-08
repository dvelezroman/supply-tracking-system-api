import { Product } from '@prisma/client';
import { demoGtin13, ean13CheckDigit, normalizeGtin13 } from './retail-label.constants';

/** Known SKU defaults (production backfill / until GS1 codes are set per product). */
export const RETAIL_LABEL_SKU_DEFAULTS: Record<
  string,
  {
    labelTitle: string;
    labelNetWeightOz: number;
    labelNetWeightLbs: number;
    labelGtin13: string;
    labelSanitaryArcsa?: string;
  }
> = {
  'CAMARON-MAREA-ALTA-COLA': {
    labelTitle: 'Camarón Premium',
    labelNetWeightOz: 32,
    labelNetWeightLbs: 2,
    labelGtin13: demoGtin13(),
    labelSanitaryArcsa: 'En trámite',
  },
  'CAMARON-BUTTERFLY-IQF': {
    labelTitle: 'Camarón Butterfly IQF',
    labelNetWeightOz: 32,
    labelNetWeightLbs: 2,
    labelGtin13: `${'593123456788'}${ean13CheckDigit('593123456788')}`,
    labelSanitaryArcsa: 'En trámite',
  },
  'CAMARON-SHELL-ON-BOX': {
    labelTitle: 'Camarón Shell On',
    labelNetWeightOz: 158.7,
    labelNetWeightLbs: 9.9,
    labelGtin13: `${'593123456787'}${ean13CheckDigit('593123456787')}`,
    labelSanitaryArcsa: 'En trámite',
  },
  'CAMARON-RETAIL-IQF-340G': {
    labelTitle: 'Camarón IQF',
    labelNetWeightOz: 12,
    labelNetWeightLbs: 0.75,
    labelGtin13: `${'593123456786'}${ean13CheckDigit('593123456786')}`,
    labelSanitaryArcsa: 'En trámite',
  },
};

export type RetailLabelEnvDefaults = {
  gtin13?: string;
  netWeightOz?: number;
  netWeightLbs?: number;
  title?: string;
  sanitaryArcsa?: string;
};

export type ResolvedRetailLabel = {
  labelTitle: string;
  labelNetWeightOz: number;
  labelNetWeightLbs: number;
  gtin13: string;
  labelSanitaryArcsa: string | null;
  /** Where each field was resolved from (for readiness UI). */
  sources: {
    title: 'lot' | 'product' | 'sku-default' | 'env' | 'inferred-name';
    gtin: 'product' | 'sku-default' | 'env';
    weight: 'product' | 'sku-default' | 'env';
    sanitary: 'product' | 'sku-default' | 'env';
  };
};

export type LotLabelInput = {
  labelName: string | null | undefined;
};

export type RetailLabelReadiness = {
  ready: boolean;
  missing: string[];
  productId: string;
  productSku: string;
  resolved?: ResolvedRetailLabel;
};

function inferTitleFromProductName(name: string): string {
  const stripped = name
    .replace(/["«»]/g, '')
    .replace(/\s*—\s*Marea Alta.*$/i, '')
    .replace(/\s*\(Cola\).*$/i, '')
    .replace(/\s*Marea Alta.*$/i, '')
    .trim();
  return stripped.length > 0 ? stripped.slice(0, 120) : name.slice(0, 120);
}

/**
 * Resolves retail label fields for a lot: lot label name + product/env defaults for GTIN, weight, etc.
 */
export function resolveRetailLabelForLot(
  lot: LotLabelInput,
  product: Pick<
    Product,
    | 'id'
    | 'sku'
    | 'name'
    | 'labelTitle'
    | 'labelGtin13'
    | 'labelNetWeightOz'
    | 'labelNetWeightLbs'
    | 'labelSanitaryArcsa'
  >,
  env: RetailLabelEnvDefaults,
): { resolved: ResolvedRetailLabel | null; missing: string[] } {
  const skuDefaults = RETAIL_LABEL_SKU_DEFAULTS[product.sku];
  const missing: string[] = [];

  let gtin13: string | null = product.labelGtin13
    ? normalizeGtin13(product.labelGtin13)
    : null;
  let gtinSource: ResolvedRetailLabel['sources']['gtin'] = 'product';
  if (!gtin13 && skuDefaults?.labelGtin13) {
    gtin13 = normalizeGtin13(skuDefaults.labelGtin13);
    gtinSource = 'sku-default';
  }
  if (!gtin13 && env.gtin13) {
    gtin13 = normalizeGtin13(env.gtin13);
    gtinSource = 'env';
  }
  if (!gtin13) missing.push('labelGtin13');

  let oz = product.labelNetWeightOz ?? undefined;
  let lbs = product.labelNetWeightLbs ?? undefined;
  let weightSource: ResolvedRetailLabel['sources']['weight'] = 'product';
  if ((oz == null || lbs == null) && skuDefaults) {
    oz = oz ?? skuDefaults.labelNetWeightOz;
    lbs = lbs ?? skuDefaults.labelNetWeightLbs;
    weightSource = 'sku-default';
  }
  if ((oz == null || lbs == null) && env.netWeightOz != null && env.netWeightLbs != null) {
    oz = oz ?? env.netWeightOz;
    lbs = lbs ?? env.netWeightLbs;
    weightSource = 'env';
  }
  if (oz == null || lbs == null) missing.push('labelNetWeightOz/labelNetWeightLbs');

  let title = lot.labelName?.trim();
  let titleSource: ResolvedRetailLabel['sources']['title'] = 'lot';
  if (!title) {
    missing.push('labelName');
    title = product.labelTitle?.trim();
    titleSource = 'product';
  }
  if (!title && skuDefaults?.labelTitle) {
    title = skuDefaults.labelTitle;
    titleSource = 'sku-default';
  }
  if (!title && env.title?.trim()) {
    title = env.title.trim();
    titleSource = 'env';
  }
  if (!title) {
    title = inferTitleFromProductName(product.name);
    titleSource = 'inferred-name';
  }

  let sanitary = product.labelSanitaryArcsa?.trim() ?? null;
  let sanitarySource: ResolvedRetailLabel['sources']['sanitary'] = 'product';
  if (!sanitary && skuDefaults?.labelSanitaryArcsa) {
    sanitary = skuDefaults.labelSanitaryArcsa;
    sanitarySource = 'sku-default';
  }
  if (!sanitary && env.sanitaryArcsa?.trim()) {
    sanitary = env.sanitaryArcsa.trim();
    sanitarySource = 'env';
  }

  if (missing.length > 0 || !gtin13 || oz == null || lbs == null) {
    return { resolved: null, missing };
  }

  return {
    resolved: {
      labelTitle: title,
      labelNetWeightOz: oz,
      labelNetWeightLbs: lbs,
      gtin13,
      labelSanitaryArcsa: sanitary,
      sources: {
        title: titleSource,
        gtin: gtinSource,
        weight: weightSource,
        sanitary: sanitarySource,
      },
    },
    missing: [],
  };
}

/** @deprecated Use {@link resolveRetailLabelForLot} — kept for tests referencing product-only resolution. */
export function resolveRetailLabelForProduct(
  product: Parameters<typeof resolveRetailLabelForLot>[1],
  env: RetailLabelEnvDefaults,
): ReturnType<typeof resolveRetailLabelForLot> {
  return resolveRetailLabelForLot({ labelName: null }, product, env);
}

export function checkRetailLabelReadiness(
  lot: LotLabelInput,
  product: Pick<
    Product,
    | 'id'
    | 'sku'
    | 'name'
    | 'labelTitle'
    | 'labelGtin13'
    | 'labelNetWeightOz'
    | 'labelNetWeightLbs'
    | 'labelSanitaryArcsa'
  >,
  env: RetailLabelEnvDefaults & { ownerRuc?: string },
): RetailLabelReadiness {
  const { resolved, missing } = resolveRetailLabelForLot(lot, product, env);
  const allMissing = [...missing];
  if (!env.ownerRuc?.trim()) {
    allMissing.push('LABEL_OWNER_RUC');
  }

  return {
    ready: allMissing.length === 0 && resolved != null,
    missing: allMissing,
    productId: product.id,
    productSku: product.sku,
    resolved: resolved ?? undefined,
  };
}
