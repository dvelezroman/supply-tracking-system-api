import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const logger = new Logger('LabelLogoUtil');

export async function fetchLabelLogo(url?: string): Promise<Buffer | null> {
  const u = url?.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) {
    return loadLogoFromFile(u);
  }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(u, { signal: ac.signal, redirect: 'follow' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32 || buf.length > 8_000_000) return null;
    const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
    return normalizeLogoBuffer(buf, u, contentType);
  } catch (e) {
    logger.warn(`LABEL_LOGO_URL fetch failed: ${(e as Error).message}`);
    return null;
  }
}

async function loadLogoFromFile(pathValue: string): Promise<Buffer | null> {
  try {
    const absolute = pathValue.startsWith('/') ? pathValue : resolve(process.cwd(), pathValue);
    const buf = await readFile(absolute);
    if (buf.length < 32 || buf.length > 8_000_000) return null;
    return normalizeLogoBuffer(buf, absolute, '');
  } catch (e) {
    logger.warn(`LABEL_LOGO_URL local file load failed: ${(e as Error).message}`);
    return null;
  }
}

async function normalizeLogoBuffer(
  original: Buffer,
  sourceUrl: string,
  contentType: string,
): Promise<Buffer | null> {
  const ext = sourceUrl.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  const startsAsSvg = original.subarray(0, 300).toString('utf8').toLowerCase().includes('<svg');
  const isSvg = contentType.includes('image/svg') || ext === 'svg' || startsAsSvg;
  if (!isSvg) return original;

  try {
    return await sharp(original, { density: 300 }).png().toBuffer();
  } catch (e) {
    logger.warn(`LABEL_LOGO_URL svg conversion failed: ${(e as Error).message}`);
    return null;
  }
}
