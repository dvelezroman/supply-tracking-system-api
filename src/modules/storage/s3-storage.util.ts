import type { SniffedImageType } from './marketplace-product-images.util';

export const DEFAULT_MARKETPLACE_KEY_PREFIX = 'mareaalta-marketplace';

export type S3StorageConfig = {
  bucket: string;
  region: string;
  keyPrefix: string;
  publicBaseUrl: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
};

function trimSlash(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

/** `bitflow-production-files/mareaalta-marketplace` → bucket + folder prefix. */
export function parseAwsS3BucketName(raw: string): {
  bucket: string;
  keyPrefix: string | null;
} {
  const value = trimSlash(raw);
  const slash = value.indexOf('/');
  if (slash === -1) {
    return { bucket: value, keyPrefix: null };
  }
  return {
    bucket: value.slice(0, slash),
    keyPrefix: trimSlash(value.slice(slash + 1)) || null,
  };
}

export function readS3StorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3StorageConfig | null {
  const named = env.AWS_S3_BUCKET_NAME?.trim() || env.S3_BUCKET?.trim() || '';
  const parsed = named ? parseAwsS3BucketName(named) : null;
  const bucket = parsed?.bucket;
  if (!bucket) {
    return null;
  }
  const region =
    env.S3_REGION?.trim() ||
    env.AWS_S3_REGION?.trim() ||
    env.AWS_REGION?.trim() ||
    'us-east-1';
  const prefixFromEnv = env.S3_KEY_PREFIX?.trim();
  const keyPrefix = trimSlash(
    parsed?.keyPrefix || prefixFromEnv || DEFAULT_MARKETPLACE_KEY_PREFIX,
  );
  const publicBase = env.S3_PUBLIC_BASE_URL?.trim();
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim() || null;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim() || null;
  return {
    bucket,
    region,
    keyPrefix,
    publicBaseUrl: publicBase ? trimSlash(publicBase) : null,
    accessKeyId,
    secretAccessKey,
  };
}

/** SKU folder segment: keep letters/digits/._- so `MA-250` stays readable. */
export function sanitizeS3KeySegment(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'sku';
}

export function productImageObjectKey(input: {
  prefix: string;
  skuCode: string;
  imageId: string;
  mimeType: SniffedImageType;
}): string {
  const ext =
    input.mimeType === 'image/jpeg'
      ? 'jpg'
      : input.mimeType === 'image/png'
        ? 'png'
        : 'webp';
  return `${trimSlash(input.prefix)}/${sanitizeS3KeySegment(input.skuCode)}/${input.imageId}.${ext}`;
}

/** AWS SDK v3 / Smithy errors for missing S3 objects (404 / NoSuchKey). */
export function isS3ObjectNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (e.$metadata?.httpStatusCode === 404) {
    return true;
  }
  const code = e.name ?? e.Code ?? '';
  return code === 'NoSuchKey' || code === 'NotFound';
}

export function publicObjectUrl(
  publicBaseUrl: string | null,
  storageKey: string,
): string | null {
  if (!publicBaseUrl) {
    return null;
  }
  return `${trimSlash(publicBaseUrl)}/${storageKey.replace(/^\/+/, '')}`;
}

/** Object key from virtual-hosted or path-style S3 HTTPS URLs. */
export function parseAwsS3ObjectKeyFromUrl(
  rawUrl: string,
  bucketHint?: string | null,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const pathKey = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!pathKey) {
    return null;
  }

  const vhost = host.match(/^(.+)\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/);
  if (vhost) {
    const bucket = vhost[1];
    if (bucketHint && bucket !== bucketHint.trim().toLowerCase()) {
      return null;
    }
    return pathKey;
  }

  if (host.startsWith('s3.') && host.endsWith('.amazonaws.com')) {
    const slash = pathKey.indexOf('/');
    if (slash <= 0) {
      return null;
    }
    const bucket = pathKey.slice(0, slash);
    const key = pathKey.slice(slash + 1);
    if (bucketHint && bucket !== bucketHint.trim().toLowerCase()) {
      return null;
    }
    return key || null;
  }

  return null;
}
