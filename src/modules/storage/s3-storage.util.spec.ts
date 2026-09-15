import {
  DEFAULT_MARKETPLACE_KEY_PREFIX,
  isS3ObjectNotFoundError,
  parseAwsS3BucketName,
  productImageObjectKey,
  publicObjectUrl,
  readS3StorageConfig,
  sanitizeS3KeySegment,
} from './s3-storage.util';

describe('s3-storage.util', () => {
  it('parses AWS_S3_BUCKET_NAME as bucket plus folder prefix', () => {
    expect(
      parseAwsS3BucketName('bitflow-production-files/mareaalta-marketplace'),
    ).toEqual({
      bucket: 'bitflow-production-files',
      keyPrefix: 'mareaalta-marketplace',
    });
    expect(parseAwsS3BucketName('bitflow-production-files')).toEqual({
      bucket: 'bitflow-production-files',
      keyPrefix: null,
    });
  });

  it('requires bucket and applies default marketplace prefix', () => {
    expect(readS3StorageConfig({})).toBeNull();
    expect(
      readS3StorageConfig({
        AWS_S3_BUCKET_NAME: 'bitflow-production-files/mareaalta-marketplace',
        S3_REGION: 'us-east-1',
      }),
    ).toMatchObject({
      bucket: 'bitflow-production-files',
      region: 'us-east-1',
      keyPrefix: 'mareaalta-marketplace',
    });
    expect(
      readS3StorageConfig({
        AWS_S3_BUCKET_NAME: 'bitflow-production-files',
        S3_REGION: 'us-east-1',
      }),
    ).toMatchObject({
      bucket: 'bitflow-production-files',
      keyPrefix: DEFAULT_MARKETPLACE_KEY_PREFIX,
    });
  });

  it('trims prefix and public base url slashes', () => {
    const cfg = readS3StorageConfig({
      S3_BUCKET: 'b',
      S3_REGION: 'us-east-1',
      S3_KEY_PREFIX: '/mareaalta/products/',
      S3_PUBLIC_BASE_URL: 'https://cdn.mareaalta.com/',
    });
    expect(cfg?.keyPrefix).toBe('mareaalta/products');
    expect(cfg?.publicBaseUrl).toBe('https://cdn.mareaalta.com');
    expect(
      publicObjectUrl(cfg?.publicBaseUrl ?? null, 'mareaalta/products/a.jpg'),
    ).toBe('https://cdn.mareaalta.com/mareaalta/products/a.jpg');
  });

  it('builds a stable object key under the configured prefix', () => {
    expect(
      productImageObjectKey({
        prefix: 'mareaalta-marketplace',
        skuCode: 'MA-250',
        imageId: 'img1',
        mimeType: 'image/jpeg',
      }),
    ).toBe('mareaalta-marketplace/MA-250/img1.jpg');
  });

  it('detects S3 missing-object errors', () => {
    expect(isS3ObjectNotFoundError({ name: 'NoSuchKey' })).toBe(true);
    expect(isS3ObjectNotFoundError({ name: 'NotFound' })).toBe(true);
    expect(
      isS3ObjectNotFoundError({ $metadata: { httpStatusCode: 404 } }),
    ).toBe(true);
    expect(isS3ObjectNotFoundError({ name: 'AccessDenied' })).toBe(false);
    expect(isS3ObjectNotFoundError(null)).toBe(false);
  });

  it('sanitizes SKU so it cannot inject extra S3 path segments', () => {
    expect(sanitizeS3KeySegment('MA-250')).toBe('MA-250');
    expect(sanitizeS3KeySegment(' MA/250 bag ')).toBe('MA-250-bag');
    expect(
      productImageObjectKey({
        prefix: 'mareaalta-marketplace',
        skuCode: 'MA/250',
        imageId: 'img1',
        mimeType: 'image/png',
      }),
    ).toBe('mareaalta-marketplace/MA-250/img1.png');
  });
});
