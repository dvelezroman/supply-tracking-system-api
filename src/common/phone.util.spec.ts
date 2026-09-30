import { normalizePhoneE164 } from './phone.util';

describe('normalizePhoneE164', () => {
  it('converts Ecuador local 09… to +593…', () => {
    expect(normalizePhoneE164('0991234567')).toBe('+593991234567');
  });

  it('keeps E.164 with plus', () => {
    expect(normalizePhoneE164('+593991234567')).toBe('+593991234567');
  });

  it('returns null for empty or invalid', () => {
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164('123')).toBeNull();
  });
});
