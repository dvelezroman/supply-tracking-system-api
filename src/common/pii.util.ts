export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split('@');
  if (!domain || !local) {
    return '***';
  }
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) {
    return '';
  }
  if (phone.length <= 4) {
    return '****';
  }
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}
