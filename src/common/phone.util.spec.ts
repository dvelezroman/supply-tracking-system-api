import { normalizePhoneE164 } from './phone.util';

describe('normalizePhoneE164', () => {
  it('converts Ecuador local 09… to +5939… (no trunk 0)', () => {
    expect(normalizePhoneE164('0995710556')).toBe('+593995710556');
    expect(normalizePhoneE164('0991234567')).toBe('+593991234567');
  });

  it('keeps already-normalized E.164', () => {
    expect(normalizePhoneE164('+593995710556')).toBe('+593995710556');
    expect(normalizePhoneE164('593995710556')).toBe('+593995710556');
  });

  it('accepts national 9 digits without leading 0', () => {
    expect(normalizePhoneE164('995710556')).toBe('+593995710556');
  });

  it('rejects +5930… and non-Ecuador / invalid', () => {
    expect(normalizePhoneE164('+5930995710556')).toBe('+593995710556');
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164('123')).toBeNull();
    expect(normalizePhoneE164('+12025550123')).toBeNull();
  });
});
