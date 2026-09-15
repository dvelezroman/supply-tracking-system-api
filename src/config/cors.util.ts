/** Add apex ↔ www counterpart for https/http site origins (not localhost). */
export function expandOriginAliases(origin: string): string[] {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized) {
    return [];
  }
  try {
    const url = new URL(normalized);
    const out = new Set<string>([url.origin]);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return [...out];
    }
    if (host.startsWith('www.')) {
      out.add(`${url.protocol}//${host.slice(4)}`);
    } else if (host.includes('.')) {
      out.add(`${url.protocol}//www.${host}`);
    }
    return [...out];
  } catch {
    return [normalized];
  }
}

export function readAllowedCorsOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.CORS_ORIGIN?.trim();
  const fromList = raw
    ? raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  const fallback = env.FRONTEND_URL?.trim();
  const seeds = fromList.length > 0 ? fromList : fallback ? [fallback] : [];
  const allowed = new Set<string>();
  for (const seed of seeds) {
    for (const origin of expandOriginAliases(seed)) {
      allowed.add(origin);
    }
  }
  return [...allowed];
}
