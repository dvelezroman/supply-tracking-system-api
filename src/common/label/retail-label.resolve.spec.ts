import {
  checkRetailLabelReadiness,
  resolveRetailLabelForLot,
} from './retail-label.resolve';

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

const baseLot = { labelName: 'Camarón Premium IQF' };

describe('retail-label.resolve', () => {
  it('uses lot labelName for the front title', () => {
    const { resolved, missing } = resolveRetailLabelForLot(baseLot, baseProduct, {});
    expect(missing).toHaveLength(0);
    expect(resolved?.labelTitle).toBe('Camarón Premium IQF');
    expect(resolved?.sources.title).toBe('lot');
    expect(resolved?.labelNetWeightLbs).toBe(2);
    expect(resolved?.sources.gtin).toBe('sku-default');
  });

  it('requires labelName on the lot', () => {
    const { missing } = resolveRetailLabelForLot({ labelName: '' }, baseProduct, {});
    expect(missing).toContain('labelName');
  });

  it('requires LABEL_OWNER_RUC for readiness', () => {
    const r = checkRetailLabelReadiness(baseLot, baseProduct, { ownerRuc: '' });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('LABEL_OWNER_RUC');
  });

  it('is ready when lot name, SKU defaults and RUC are set', () => {
    const r = checkRetailLabelReadiness(baseLot, baseProduct, { ownerRuc: '1791234567001' });
    expect(r.ready).toBe(true);
    expect(r.resolved?.gtin13).toHaveLength(13);
  });
});
