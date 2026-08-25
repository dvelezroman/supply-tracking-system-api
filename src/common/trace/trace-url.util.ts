import type { ConfigService } from '@nestjs/config';

const DEFAULT_TRACE_ENTRY_PATH = '/trace';

export function getPublicTraceEntryPath(config: ConfigService): string {
  const configured = config.get<string>('publicTraceEntryPath')?.trim();
  if (configured) {
    return configured.startsWith('/') ? configured : `/${configured}`;
  }
  return DEFAULT_TRACE_ENTRY_PATH;
}

export function buildGlobalTraceEntryUrl(config: ConfigService): string {
  const base = config.get<string>('frontendUrl') ?? 'http://localhost:4200';
  const trimmed = base.replace(/\/$/, '');
  const path = getPublicTraceEntryPath(config);
  return `${trimmed}${path}`;
}

/** Legacy direct lot URL — kept for backward compatibility with old printed QRs. */
export function buildLegacyLotTraceUrl(
  config: ConfigService,
  lotCode: string,
): string {
  const base = config.get<string>('frontendUrl') ?? 'http://localhost:4200';
  const trimmed = base.replace(/\/$/, '');
  return `${trimmed}/trace/${encodeURIComponent(lotCode)}`;
}
