/**
 * Ecuador WhatsApp phone only (for now): +593 + 9 national digits starting with 9.
 * Example: +593995710556
 * Local 09… → trunk 0 dropped (never +5930…).
 */

export const ECUADOR_DIAL = '593';

const NATIONAL_RE = /^9\d{8}$/;

function ecuadorNationalDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith(ECUADOR_DIAL)) {
    digits = digits.slice(ECUADOR_DIAL.length);
  }
  return digits.replace(/^0+/, '');
}

/**
 * Normalize phone to Ecuador WhatsApp E.164: +5939XXXXXXXX
 * Returns null when empty/invalid.
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

  const national = ecuadorNationalDigits(trimmed);
  if (!NATIONAL_RE.test(national)) {
    return null;
  }
  return `+${ECUADOR_DIAL}${national}`;
}
