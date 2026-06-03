import { checkRetailLabelReadiness, resolveRetailLabelForProduct } from './retail-label.resolve';

const baseProduct = {
  id: 'p1',
  sku: 'CAMARON-MAREA-ALTA-COLA',
  name: 'Camarón Premium "Marea Alta" (Cola)',
  labelTitle: null,
  labelGtin13: null,
  labelNetWeightOz: null,
  labelNetWeightLbs: null,
  labelSanitaryArcsa: null,
};

describe('retail-label.resolve', () => {
  it('resolves from SKU catalog when product fields are null', () => {
    const { resolved, missing } = resolveRetailLabelForProduct(baseProduct, {});
    expect(missing).toHaveLength(0);
    expect(resolved?.labelTitle).toBe('Camarón Premium');
    expect(resolved?.labelNetWeightLbs).toBe(2);
    expect(resolved?.sources.gtin).toBe('sku-default');
  });

  it('requires LABEL_OWNER_RUC for readiness', () => {
    const r = checkRetailLabelReadiness(baseProduct, { ownerRuc: '' });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('LABEL_OWNER_RUC');
  });

  it('is ready when SKU defaults and RUC are set', () => {
    const r = checkRetailLabelReadiness(baseProduct, { ownerRuc: '1791234567001' });
    expect(r.ready).toBe(true);
    expect(r.resolved?.gtin13).toHaveLength(13);
  });
});
