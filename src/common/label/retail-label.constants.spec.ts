import { Presentation } from '@prisma/client';
import {
  PRESENTATION_LABEL_SUBTITLE,
  ean13CheckDigit,
  isValidGtin13,
  formatNetWeightEs,
  netWeightGramsFromLbs,
  buildManufacturingLine,
  demoGtin13,
  DEMO_GTIN12_ECUADOR,
} from './retail-label.constants';

describe('retail-label.constants', () => {
  describe('PRESENTATION_LABEL_SUBTITLE', () => {
    it('maps PD_TAIL_OFF to cola pelado desvenado', () => {
      expect(PRESENTATION_LABEL_SUBTITLE[Presentation.PD_TAIL_OFF]).toBe(
        'Camarón cola, pelado, desvenado y congelado',
      );
    });

    it('maps SHELL_ON to descabezado con cáscara', () => {
      expect(PRESENTATION_LABEL_SUBTITLE[Presentation.SHELL_ON]).toBe('Descabezado con cáscara');
    });
  });

  describe('formatNetWeightEs', () => {
    it('formats net weight in grams only', () => {
      expect(formatNetWeightEs(32, 2)).toBe('Contenido Neto: 907 g');
    });

    it('computes grams from pounds', () => {
      expect(netWeightGramsFromLbs(2)).toBe(907);
    });
  });

  describe('GTIN-13', () => {
    it('computes check digit for demo prefix', () => {
      expect(ean13CheckDigit(DEMO_GTIN12_ECUADOR)).toBe(0);
      expect(demoGtin13()).toBe('5931234567890');
    });

    it('validates a correct EAN-13', () => {
      expect(isValidGtin13(demoGtin13())).toBe(true);
      expect(isValidGtin13('5931234567891')).toBe(false);
    });
  });

  describe('buildManufacturingLine', () => {
    it('includes co-packer, owner, RUC and location', () => {
      const line = buildManufacturingLine({
        coPackerName: 'Planta Demo S.A.',
        ownerLegalName: 'MAREA ALTA',
        ownerRuc: '1791234567001',
        ownerLocation: 'Portoviejo - Manabí - Ecuador',
      });
      expect(line).toContain('Fabricado por: Planta Demo S.A.');
      expect(line).toContain('para MAREA ALTA');
      expect(line).toContain('RUC: 1791234567001');
      expect(line).toContain('Portoviejo - Manabí - Ecuador');
    });
  });
});
