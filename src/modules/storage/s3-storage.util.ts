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

export function publicObjectUrl(
  publicBaseUrl: string | null,
  storageKey: string,
): string | null {
  if (!publicBaseUrl) {
    return null;
  }
  return `${trimSlash(publicBaseUrl)}/${storageKey.replace(/^\/+/, '')}`;
}
