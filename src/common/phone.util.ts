/** Longest first. WhatsApp send shape is +{dial}{national} with no trunk 0. */
const DIAL_CODES = [
  '593',
  '598',
  '595',
  '591',
  '507',
  '506',
  '505',
  '504',
  '503',
  '502',
  '57',
  '56',
  '55',
  '54',
  '52',
  '51',
  '34',
  '1',
];

function stripTrunkZero(digits: string): string {
  const dial = DIAL_CODES.find((code) => digits.startsWith(code));
  if (!dial) return digits;
  const national = digits.slice(dial.length).replace(/^0+/, '');
  if (!national) return digits;
  return `${dial}${national}`;
}

/**
 * Normalize phone toward E.164 for WhatsApp: +{country}{national}.
 * Ecuador local mobiles starting with 09… → +5939… (trunk 0 dropped).
 * Returns null when input empty/invalid for storage.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
): string | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    const rest = stripTrunkZero(digits.slice(1).replace(/\D/g, ''));
    if (rest.length < 8 || rest.length > 15) {
      return null;
    }
    return `+${rest}`;
  }

  const onlyDigits = digits.replace(/\D/g, '');
  if (onlyDigits.startsWith('0') && onlyDigits.length === 10) {
    return `+593${onlyDigits.slice(1)}`;
  }
  const normalized = stripTrunkZero(onlyDigits);
  if (normalized.length >= 8 && normalized.length <= 15) {
    return `+${normalized}`;
  }
  return null;
}
